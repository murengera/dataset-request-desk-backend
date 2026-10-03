import json
from datetime import date
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from episodes.models import Episode
from dataset_requests.models import Request, Assignment

User = get_user_model()


class APITests(TestCase):
    def setUp(self):
        self.client = Client()

        # Seed test users
        self.client_user = User.objects.create_user(
            username="client_1",
            email="client1@example.com",
            password="password123",
            role=User.Role.CLIENT,
            organisation="Client Org",
        )
        self.other_client = User.objects.create_user(
            username="client_2",
            email="client2@example.com",
            password="password123",
            role=User.Role.CLIENT,
        )
        self.operator_user = User.objects.create_user(
            username="op_1",
            email="op1@example.com",
            password="password123",
            role=User.Role.OPERATOR,
        )

        self.token_client, _ = Token.objects.get_or_create(user=self.client_user)
        self.token_other, _ = Token.objects.get_or_create(user=self.other_client)
        self.token_operator, _ = Token.objects.get_or_create(user=self.operator_user)

        # Seed episodes
        self.ep1 = Episode.objects.create(
            episode_id="EP-001",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=timezone.now(),
            duration_seconds=30,
            operator_name="Operator A",
            quality=Episode.Quality.GOOD,
        )
        self.ep2 = Episode.objects.create(
            episode_id="EP-002",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=timezone.now(),
            duration_seconds=40,
            operator_name="Operator A",
            quality=Episode.Quality.USABLE,
        )

    def auth_headers(self, token):
        return {"HTTP_AUTHORIZATION": f"Token {token.key}"}

    def test_health_check_endpoint(self):
        resp = self.client.get("/api/health/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "healthy")

    def test_login_flow(self):
        resp = self.client.post(
            "/api/auth/login/",
            data=json.dumps({
                "username_or_email": "client1@example.com",
                "password": "password123",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("token", resp.json())
        self.assertEqual(resp.json()["user"]["role"], "client")

    def test_client_creates_request_and_sees_only_own_requests(self):
        # Create request as client_user
        create_resp = self.client.post(
            "/api/requests/",
            data=json.dumps({
                "task_name": "pick cup",
                "episodes_requested": 2,
                "deadline": "2026-10-20",
                "notes": "Urgent batch",
            }),
            content_type="application/json",
            **self.auth_headers(self.token_client),
        )
        self.assertEqual(create_resp.status_code, 201)
        req_id = create_resp.json()["id"]

        # List requests as client_user (should see 1)
        list_resp = self.client.get("/api/requests/", **self.auth_headers(self.token_client))
        self.assertEqual(len(list_resp.json()), 1)

        # List requests as other_client (should see 0)
        other_list = self.client.get("/api/requests/", **self.auth_headers(self.token_other))
        self.assertEqual(len(other_list.json()), 0)

        # List requests as operator (should see all)
        op_list = self.client.get("/api/requests/", **self.auth_headers(self.token_operator))
        self.assertEqual(len(op_list.json()), 1)

    def test_request_lifecycle_and_assignment_api(self):
        # 1. Client creates request
        create_resp = self.client.post(
            "/api/requests/",
            data=json.dumps({
                "task_name": "pick cup",
                "episodes_requested": 2,
                "deadline": "2026-10-20",
            }),
            content_type="application/json",
            **self.auth_headers(self.token_client),
        )
        req_id = create_resp.json()["id"]

        # 2. Operator transitions to in_progress
        trans_resp = self.client.post(
            f"/api/requests/{req_id}/transition/",
            data=json.dumps({"status": "in_progress"}),
            content_type="application/json",
            **self.auth_headers(self.token_operator),
        )
        self.assertEqual(trans_resp.status_code, 200)
        self.assertEqual(trans_resp.json()["status"], "in_progress")

        # 3. Operator attempts to deliver before assigning episodes (Must fail 400)
        fail_deliv = self.client.post(
            f"/api/requests/{req_id}/transition/",
            data=json.dumps({"status": "delivered"}),
            content_type="application/json",
            **self.auth_headers(self.token_operator),
        )
        self.assertEqual(fail_deliv.status_code, 400)

        # 4. Operator assigns 2 episodes
        assign_resp1 = self.client.post(
            f"/api/requests/{req_id}/assign/",
            data=json.dumps({"episode_id": "EP-001"}),
            content_type="application/json",
            **self.auth_headers(self.token_operator),
        )
        self.assertEqual(assign_resp1.status_code, 201)

        assign_resp2 = self.client.post(
            f"/api/requests/{req_id}/assign/",
            data=json.dumps({"episode_id": "EP-002"}),
            content_type="application/json",
            **self.auth_headers(self.token_operator),
        )
        self.assertEqual(assign_resp2.status_code, 201)

        # 5. Operator delivers (Now succeeds)
        succ_deliv = self.client.post(
            f"/api/requests/{req_id}/transition/",
            data=json.dumps({"status": "delivered"}),
            content_type="application/json",
            **self.auth_headers(self.token_operator),
        )
        self.assertEqual(succ_deliv.status_code, 200)
        self.assertEqual(succ_deliv.json()["status"], "delivered")

        # 6. Client accepts delivery
        accept_resp = self.client.post(
            f"/api/requests/{req_id}/transition/",
            data=json.dumps({"status": "accepted"}),
            content_type="application/json",
            **self.auth_headers(self.token_client),
        )
        self.assertEqual(accept_resp.status_code, 200)
        self.assertEqual(accept_resp.json()["status"], "accepted")

        # Verify audit history
        detail_resp = self.client.get(f"/api/requests/{req_id}/", **self.auth_headers(self.token_client))
        self.assertEqual(len(detail_resp.json()["status_history"]), 4)

    def test_client_cannot_assign_or_deliver_via_api(self):
        # Client creates request
        create_resp = self.client.post(
            "/api/requests/",
            data=json.dumps({
                "task_name": "pick cup",
                "episodes_requested": 1,
                "deadline": "2026-10-20",
            }),
            content_type="application/json",
            **self.auth_headers(self.token_client),
        )
        req_id = create_resp.json()["id"]

        # Client attempts to assign episode (Must fail 403)
        assign_resp = self.client.post(
            f"/api/requests/{req_id}/assign/",
            data=json.dumps({"episode_id": "EP-001"}),
            content_type="application/json",
            **self.auth_headers(self.token_client),
        )
        self.assertEqual(assign_resp.status_code, 403)

        # Client attempts to transition to in_progress (Must fail 403)
        trans_resp = self.client.post(
            f"/api/requests/{req_id}/transition/",
            data=json.dumps({"status": "in_progress"}),
            content_type="application/json",
            **self.auth_headers(self.token_client),
        )
        self.assertEqual(trans_resp.status_code, 403)
