import json
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from episodes.models import Episode
from dataset_requests.analytics import get_analytics_data
from dataset_requests.models import Request, RequestStatusHistory

User = get_user_model()


class AnalyticsTests(TestCase):
    def setUp(self):
        self.client = Client()

        self.operator_user = User.objects.create_user(
            username="analytics_op",
            email="op@example.com",
            password="password123",
            role=User.Role.OPERATOR,
        )
        self.client_user = User.objects.create_user(
            username="analytics_client",
            email="client@example.com",
            password="password123",
            role=User.Role.CLIENT,
        )

        self.op_token, _ = Token.objects.get_or_create(user=self.operator_user)
        self.client_token, _ = Token.objects.get_or_create(user=self.client_user)

        now = timezone.now()

        # Seed Episodes
        Episode.objects.create(
            episode_id="EP-AN-01",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=now - timedelta(days=2),
            duration_seconds=30,
            operator_name="Alice",
            quality=Episode.Quality.GOOD,
        )
        Episode.objects.create(
            episode_id="EP-AN-02",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=now - timedelta(days=2),
            duration_seconds=40,
            operator_name="Alice",
            quality=Episode.Quality.GOOD,
        )
        Episode.objects.create(
            episode_id="EP-AN-03",
            robot_id="mobile-02",
            task_name="stack blocks",
            recorded_at=now - timedelta(days=1),
            duration_seconds=50,
            operator_name="Bob",
            quality=Episode.Quality.USABLE,
        )

        # Seed Request & Delivery History
        req = Request.objects.create(
            client=self.client_user,
            task_name="pick cup",
            episodes_requested=2,
            deadline=now.date() + timedelta(days=5),
            status=Request.Status.DELIVERED,
        )
        RequestStatusHistory.objects.create(
            request=req,
            old_status=Request.Status.IN_PROGRESS,
            new_status=Request.Status.DELIVERED,
            changed_by=self.operator_user,
        )

    def test_analytics_function_data(self):
        now = timezone.now().date()
        data = get_analytics_data(
            start_date=now - timedelta(days=10),
            end_date=now + timedelta(days=1),
        )

        # 1. Episodes per day per robot
        self.assertTrue(len(data["episodes_per_day_per_robot"]) >= 2)

        # 2. Request fulfilment counts
        self.assertEqual(data["request_fulfilment"]["counts_by_status"]["delivered"], 1)

        # 3. Top tasks by good episodes
        top_tasks = data["top_5_tasks_by_good_episodes"]
        self.assertEqual(len(top_tasks), 1)
        self.assertEqual(top_tasks[0]["task_name"], "pick cup")
        self.assertEqual(top_tasks[0]["good_episodes_count"], 2)

    def test_analytics_endpoint_operator_access(self):
        resp = self.client.get(
            "/api/requests/analytics/",
            HTTP_AUTHORIZATION=f"Token {self.op_token.key}",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("episodes_per_day_per_robot", resp.json())
        self.assertIn("request_fulfilment", resp.json())
        self.assertIn("top_5_tasks_by_good_episodes", resp.json())

    def test_analytics_endpoint_client_forbidden(self):
        resp = self.client.get(
            "/api/requests/analytics/",
            HTTP_AUTHORIZATION=f"Token {self.client_token.key}",
        )
        self.assertEqual(resp.status_code, 403)
