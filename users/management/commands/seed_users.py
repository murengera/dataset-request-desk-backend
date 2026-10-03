import json
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Seed initial users from seed/users.json"

    def handle(self, *args, **options):
        seed_path = settings.BASE_DIR / "seed" / "users.json"
        if not seed_path.exists():
            self.stdout.write(self.style.ERROR(f"Seed file not found at {seed_path}"))
            return

        with open(seed_path, "r", encoding="utf-8") as f:
            users_data = json.load(f)

        created_count = 0
        updated_count = 0

        for item in users_data:
            email = item["email"]
            password = item["password"]
            role = item["role"]
            name = item.get("name", "")
            organisation = item.get("organisation", "")
            username = email  # Using email as username

            first_name, _, last_name = name.partition(" ")

            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "role": role,
                    "first_name": first_name,
                    "last_name": last_name,
                    "organisation": organisation,
                    "is_staff": (role == "admin"),
                    "is_superuser": (role == "admin"),
                },
            )

            # Always set properly hashed password
            user.set_password(password)
            user.role = role
            user.first_name = first_name
            user.last_name = last_name
            user.organisation = organisation
            user.is_staff = (role == "admin")
            user.is_superuser = (role == "admin")
            user.save()

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded users: {created_count} created, {updated_count} updated."
            )
        )
