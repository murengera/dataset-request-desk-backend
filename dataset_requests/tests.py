from datetime import date
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from episodes.models import Episode
from dataset_requests.exceptions import WorkflowError, AuthorizationError, AssignmentError
from dataset_requests.models import Request, Assignment, RequestStatusHistory
from dataset_requests.services import (
    create_request,
    transition_request_status,
    assign_episode_to_request,
    unassign_episode_from_request,
)

User = get_user_model()


class RequestServiceAndWorkflowTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="client_a",
            email="client@example.com",
            password="password",
            role=User.Role.CLIENT,
        )
        self.other_client = User.objects.create_user(
            username="client_b",
            email="client_b@example.com",
            password="password",
            role=User.Role.CLIENT,
        )
        self.operator_user = User.objects.create_user(
            username="operator_ops",
            email="ops@example.com",
            password="password",
            role=User.Role.OPERATOR,
        )
        self.admin_user = User.objects.create_user(
            username="admin_ada",
            email="admin@example.com",
            password="password",
            role=User.Role.ADMIN,
        )

        self.good_ep1 = Episode.objects.create(
            episode_id="EP-001",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=timezone.now(),
            duration_seconds=30,
            operator_name="Dan",
            quality=Episode.Quality.GOOD,
        )
        self.usable_ep2 = Episode.objects.create(
            episode_id="EP-002",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=timezone.now(),
            duration_seconds=40,
            operator_name="Dan",
            quality=Episode.Quality.USABLE,
        )
        self.bad_ep = Episode.objects.create(
            episode_id="EP-003",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=timezone.now(),
            duration_seconds=20,
            operator_name="Dan",
            quality=Episode.Quality.BAD,
        )

    def test_create_request_service(self):
        req = create_request(
            client_user=self.client_user,
            task_name="pick cup",
            episodes_requested=2,
            deadline=date(2026, 10, 15),
            notes="Handle with care",
        )
        self.assertEqual(req.status, Request.Status.SUBMITTED)
        self.assertEqual(req.status_history.count(), 1)
        history = req.status_history.first()
        self.assertIsNone(history.old_status)
        self.assertEqual(history.new_status, Request.Status.SUBMITTED)
        self.assertEqual(history.changed_by, self.client_user)

    def test_create_request_by_non_client_fails(self):
        with self.assertRaises(AuthorizationError):
            create_request(
                client_user=self.operator_user,
                task_name="pick cup",
                episodes_requested=1,
                deadline=date(2026, 10, 15),
            )

    def test_assignment_rules(self):
        req = create_request(
            client_user=self.client_user,
            task_name="pick cup",
            episodes_requested=2,
            deadline=date(2026, 10, 15),
        )

        # 1. Non-operator cannot assign
        with self.assertRaises(AuthorizationError):
            assign_episode_to_request(req, self.good_ep1, self.client_user)

        # 2. Cannot assign bad episode
        with self.assertRaises(AssignmentError):
            assign_episode_to_request(req, self.bad_ep, self.operator_user)

        # 3. Assign good episode succeeds
        assignment1 = assign_episode_to_request(req, self.good_ep1, self.operator_user)
        self.assertEqual(req.assignments.count(), 1)

        # 4. Cannot assign same episode again to another request
        req2 = create_request(
            client_user=self.client_user,
            task_name="pick cup",
            episodes_requested=1,
            deadline=date(2026, 10, 15),
        )
        with self.assertRaises(AssignmentError):
            assign_episode_to_request(req2, self.good_ep1, self.operator_user)

        # 5. Unassign episode
        unassign_episode_from_request(assignment1, self.operator_user)
        self.assertEqual(req.assignments.count(), 0)

    def test_complete_workflow_happy_path(self):
        # 1. Client creates request
        req = create_request(
            client_user=self.client_user,
            task_name="pick cup",
            episodes_requested=2,
            deadline=date(2026, 10, 15),
        )

        # 2. Operator moves to in_progress
        transition_request_status(req, Request.Status.IN_PROGRESS, self.operator_user)
        self.assertEqual(req.status, Request.Status.IN_PROGRESS)

        # 3. Operator tries to deliver before assigning episodes (Must fail!)
        with self.assertRaises(WorkflowError):
            transition_request_status(req, Request.Status.DELIVERED, self.operator_user)

        # Assign 2 required episodes
        assign_episode_to_request(req, self.good_ep1, self.operator_user)
        assign_episode_to_request(req, self.usable_ep2, self.operator_user)

        # 4. Operator delivers (Now succeeds!)
        transition_request_status(req, Request.Status.DELIVERED, self.operator_user)
        self.assertEqual(req.status, Request.Status.DELIVERED)

        # 5. Unauthorized client cannot accept/reject
        with self.assertRaises(AuthorizationError):
            transition_request_status(req, Request.Status.ACCEPTED, self.other_client)

        # 6. Request owner client accepts
        transition_request_status(req, Request.Status.ACCEPTED, self.client_user)
        self.assertEqual(req.status, Request.Status.ACCEPTED)

        # 7. Terminal state: cannot transition accepted request
        with self.assertRaises(WorkflowError):
            transition_request_status(req, Request.Status.IN_PROGRESS, self.operator_user)

    def test_rework_workflow_flow(self):
        req = create_request(
            client_user=self.client_user,
            task_name="pick cup",
            episodes_requested=1,
            deadline=date(2026, 10, 15),
        )
        transition_request_status(req, Request.Status.IN_PROGRESS, self.operator_user)
        assign_episode_to_request(req, self.good_ep1, self.operator_user)
        transition_request_status(req, Request.Status.DELIVERED, self.operator_user)

        # Client rejects delivery
        transition_request_status(req, Request.Status.REJECTED, self.client_user)
        self.assertEqual(req.status, Request.Status.REJECTED)

        # Operator reopens for rework (rejected -> in_progress)
        transition_request_status(req, Request.Status.IN_PROGRESS, self.operator_user)
        self.assertEqual(req.status, Request.Status.IN_PROGRESS)

        # Check total audit history count
        self.assertEqual(req.status_history.count(), 5)
