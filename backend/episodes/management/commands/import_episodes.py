from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from episodes.importer import import_episodes_from_csv


class Command(BaseCommand):
    help = "Import episodes from a CSV file (e.g. seed/episodes.csv)"

    def add_arguments(self, parser):
        parser.add_argument(
            "csv_path",
            nargs="?",
            type=str,
            default=str(settings.BASE_DIR / "seed" / "episodes.csv"),
            help="Path to CSV file (defaults to seed/episodes.csv)",
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv_path"])
        if not csv_path.exists():
            raise CommandError(f"CSV file does not exist at {csv_path}")

        self.stdout.write(f"Starting import from {csv_path}...")
        report = import_episodes_from_csv(str(csv_path))

        self.stdout.write(self.style.SUCCESS(
            f"Import complete:\n"
            f"  - Total rows processed: {report['total_rows']}\n"
            f"  - Newly imported:       {report['imported_count']}\n"
            f"  - Updated:              {report['updated_count']}\n"
            f"  - Skipped (invalid):    {report['skipped_count']}"
        ))

        if report["errors"]:
            self.stdout.write(self.style.WARNING("\nSkipped rows breakdown:"))
            for err in report["errors"]:
                ep_id_str = f" [ID: {err['episode_id']}]" if err['episode_id'] else ""
                self.stdout.write(f"  * Row {err['row']}{ep_id_str}: {err['reason']}")
