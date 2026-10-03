import io
from datetime import datetime
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from .importer import import_episodes_from_csv, parse_datetime, parse_duration, clean_quality
from .models import Episode


class EpisodeModelTests(TestCase):
    def test_create_episode(self):
        episode = Episode.objects.create(
            episode_id="EP-00001",
            robot_id="arm-01",
            task_name="pick cup",
            recorded_at=timezone.now(),
            duration_seconds=45,
            operator_name="Alice",
            quality=Episode.Quality.GOOD,
        )
        self.assertEqual(episode.episode_id, "EP-00001")
        self.assertIn("EP-00001 - pick cup (good)", str(episode))

    def test_episode_id_uniqueness(self):
        now = timezone.now()
        Episode.objects.create(
            episode_id="EP-UNIQUE-01",
            robot_id="arm-01",
            task_name="open drawer",
            recorded_at=now,
            duration_seconds=30,
            operator_name="Bob",
            quality=Episode.Quality.USABLE,
        )
        with self.assertRaises(IntegrityError):
            Episode.objects.create(
                episode_id="EP-UNIQUE-01",
                robot_id="arm-02",
                task_name="open drawer",
                recorded_at=now,
                duration_seconds=30,
                operator_name="Bob",
                quality=Episode.Quality.USABLE,
            )


class EpisodeCSVImporterTests(TestCase):
    def test_parse_helpers(self):
        # Datetime parsing
        self.assertIsNotNone(parse_datetime("2026-08-16T23:28:00"))
        self.assertIsNotNone(parse_datetime("2026-08-14 09:12:00"))
        self.assertIsNotNone(parse_datetime("14/08/2026 09:15"))
        self.assertIsNone(parse_datetime("invalid-date"))

        # Duration parsing
        self.assertEqual(parse_duration("78"), 78)
        self.assertEqual(parse_duration("45.5"), 46)
        self.assertIsNone(parse_duration("-5"))
        self.assertIsNone(parse_duration("abc"))

        # Quality cleaning
        self.assertEqual(clean_quality("GOOD"), "good")
        self.assertEqual(clean_quality("Usable"), "usable")
        self.assertIsNone(clean_quality("excellent"))

    def test_import_valid_csv(self):
        csv_data = (
            "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"
            "EP-01,arm-01,pick cup,2026-08-16T23:28:00,78,Diane,good\n"
            "EP-02,mobile-01,wipe table,14/08/2026 09:15,45.5,Patrick,USABLE\n"
        )
        f = io.StringIO(csv_data)
        report = import_episodes_from_csv(f)

        self.assertEqual(report["total_rows"], 2)
        self.assertEqual(report["imported_count"], 2)
        self.assertEqual(report["skipped_count"], 0)
        self.assertEqual(Episode.objects.count(), 2)

    def test_import_idempotency(self):
        csv_data = (
            "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"
            "EP-01,arm-01,pick cup,2026-08-16T23:28:00,78,Diane,good\n"
        )
        # Run 1
        f1 = io.StringIO(csv_data)
        report1 = import_episodes_from_csv(f1)
        self.assertEqual(report1["imported_count"], 1)
        self.assertEqual(report1["updated_count"], 0)

        # Run 2 (Same CSV)
        f2 = io.StringIO(csv_data)
        report2 = import_episodes_from_csv(f2)
        self.assertEqual(report2["imported_count"], 0)
        self.assertEqual(report2["updated_count"], 1)
        self.assertEqual(Episode.objects.count(), 1)

    def test_import_skips_invalid_rows_and_reports_reasons(self):
        csv_data = (
            "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"
            ",arm-01,pick cup,2026-08-16T23:28:00,78,Diane,good\n"  # Missing ID
            "EP-02,arm-01,pick cup,not-a-date,78,Diane,good\n"      # Bad Date
            "EP-03,arm-01,pick cup,2026-08-16T23:28:00,-10,Diane,good\n"  # Negative duration
            "EP-04,arm-01,pick cup,2026-08-16T23:28:00,78,Diane,excellent\n"  # Invalid quality
        )
        f = io.StringIO(csv_data)
        report = import_episodes_from_csv(f)

        self.assertEqual(report["total_rows"], 4)
        self.assertEqual(report["imported_count"], 0)
        self.assertEqual(report["skipped_count"], 4)
        self.assertEqual(len(report["errors"]), 4)
        self.assertEqual(Episode.objects.count(), 0)

    def test_import_csv_api_endpoint(self):
        from django.contrib.auth import get_user_model
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.authtoken.models import Token
        from django.test import Client

        User = get_user_model()
        client = Client()

        op = User.objects.create_user(username="api_op", role=User.Role.OPERATOR)
        token, _ = Token.objects.get_or_create(user=op)

        csv_content = b"episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\nEP-API-1,arm-01,pick cup,2026-08-16T23:28:00,50,Op,good\n"
        uploaded_file = SimpleUploadedFile("test_episodes.csv", csv_content, content_type="text/csv")

        resp = client.post(
            "/api/episodes/import_csv/",
            {"file": uploaded_file},
            HTTP_AUTHORIZATION=f"Token {token.key}",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["imported_count"], 1)
        self.assertEqual(Episode.objects.filter(episode_id="EP-API-1").count(), 1)
