import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

User = get_user_model()


class UserModelTests(TestCase):
    def test_create_user_with_role(self):
        user = User.objects.create_user(
            username="client_user",
            email="client@example.com",
            password="securepassword123",
            role=User.Role.CLIENT,
            organisation="Acme Robotics",
        )
        self.assertEqual(user.role, "client")
        self.assertEqual(user.organisation, "Acme Robotics")
        self.assertIn("client_user (client)", str(user))

    def test_create_operator_and_admin(self):
        op = User.objects.create_user(
            username="op_user",
            role=User.Role.OPERATOR,
        )
        self.assertEqual(op.role, "operator")

        admin = User.objects.create_user(
            username="admin_user",
            role=User.Role.ADMIN,
        )
        self.assertEqual(admin.role, "admin")


class UserRegistrationAPITests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_client_registration_success(self):
        resp = self.client.post(
            "/api/auth/register/",
            data=json.dumps({
                "email": "newclient@example.com",
                "password": "strongpassword123",
                "name": "Sarah Client",
                "organisation": "TechCorp",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["email"], "newclient@example.com")
        self.assertEqual(data["user"]["role"], "client")
        self.assertEqual(data["user"]["organisation"], "TechCorp")

    def test_client_registration_duplicate_email_fails(self):
        User.objects.create_user(
            username="existing@example.com",
            email="existing@example.com",
            password="password123",
        )
        resp = self.client.post(
            "/api/auth/register/",
            data=json.dumps({
                "email": "existing@example.com",
                "password": "strongpassword123",
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("email", resp.json())


class UserAdminAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_user(
            username="admin@test.com", email="admin@test.com", password="pass", role=User.Role.ADMIN
        )
        self.operator = User.objects.create_user(
            username="op@test.com", email="op@test.com", password="pass", role=User.Role.OPERATOR
        )
        self.target_user = User.objects.create_user(
            username="target@test.com", email="target@test.com", password="pass", role=User.Role.CLIENT
        )
        from rest_framework.authtoken.models import Token
        self.admin_token, _ = Token.objects.get_or_create(user=self.admin)
        self.op_token, _ = Token.objects.get_or_create(user=self.operator)

    def test_admin_can_list_and_deactivate_users(self):
        # Admin lists users
        resp = self.client.get("/api/users/", HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(len(resp.json()) >= 3)

        # Admin deactivates user
        patch_resp = self.client.patch(
            f"/api/users/{self.target_user.id}/",
            data=json.dumps({"is_active": False, "role": "operator"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Token {self.admin_token.key}",
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.target_user.refresh_from_db()
        self.assertFalse(self.target_user.is_active)
        self.assertEqual(self.target_user.role, "operator")

    def test_non_admin_cannot_access_user_management(self):
        resp = self.client.get("/api/users/", HTTP_AUTHORIZATION=f"Token {self.op_token.key}")
        self.assertEqual(resp.status_code, 403)
