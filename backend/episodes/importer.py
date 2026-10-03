import csv
from datetime import datetime
from django.utils import timezone
from .models import Episode


def parse_datetime(dt_str):
    """
    Parse a datetime string in common messy formats:
    - ISO 8601: '2026-08-16T23:28:00', '2026-08-14T09:20:00Z'
    - Standard: '2026-08-14 09:12:00'
    - Slash format: '14/08/2026 09:15', '14/08/2026 09:15:00'
    Returns a timezone-aware datetime or None if invalid.
    """
    if not dt_str:
        return None

    dt_str = dt_str.strip().rstrip("Z")

    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(dt_str, fmt)
            # Make timezone-aware (UTC)
            return timezone.make_aware(dt, timezone.utc)
        except ValueError:
            continue

    return None


def parse_duration(duration_str):
    """
    Parse duration in seconds.
    Handles integer strings ('78') and float strings ('45.5' -> 46).
    Returns positive integer or None if invalid/negative.
    """
    if not duration_str:
        return None
    try:
        val = float(str(duration_str).strip())
        if val <= 0:
            return None
        return round(val)
    except (ValueError, TypeError):
        return None


def clean_quality(quality_str):
    """
    Normalizes quality string to lowercase ('Good' -> 'good').
    Returns 'good', 'usable', 'bad', or None if invalid.
    """
    if not quality_str:
        return None
    q = quality_str.strip().lower()
    if q in (Episode.Quality.GOOD, Episode.Quality.USABLE, Episode.Quality.BAD):
        return q
    return None


def import_episodes_from_csv(file_obj_or_path):
    """
    Imports episodes from a CSV file (path or file-like object).
    
    Idempotent: Running multiple times will update existing records without duplicates.
    
    Returns a dictionary report:
    {
        'total_rows': int,
        'imported_count': int,
        'updated_count': int,
        'skipped_count': int,
        'errors': [{'row': int, 'episode_id': str, 'reason': str}]
    }
    """
    if isinstance(file_obj_or_path, str):
        f = open(file_obj_or_path, "r", encoding="utf-8-sig")
        should_close = True
    else:
        f = file_obj_or_path
        should_close = False

    report = {
        "total_rows": 0,
        "imported_count": 0,
        "updated_count": 0,
        "skipped_count": 0,
        "errors": [],
    }

    try:
        reader = csv.DictReader(f)

        for row_idx, row in enumerate(reader, start=2):  # Header is row 1
            report["total_rows"] += 1

            # Clean and strip all field values
            episode_id = (row.get("episode_id") or "").strip()
            robot_id = (row.get("robot_id") or "").strip()
            task_name = (row.get("task_name") or "").strip()
            recorded_at_raw = (row.get("recorded_at") or "").strip()
            duration_raw = (row.get("duration_seconds") or "").strip()
            operator_name = (row.get("operator_name") or "").strip()
            quality_raw = (row.get("quality") or "").strip()

            # 1. Validate required ID
            if not episode_id:
                report["skipped_count"] += 1
                report["errors"].append({
                    "row": row_idx,
                    "episode_id": "",
                    "reason": "Missing episode_id",
                })
                continue

            # 2. Validate required metadata fields
            if not robot_id or not task_name or not operator_name:
                report["skipped_count"] += 1
                report["errors"].append({
                    "row": row_idx,
                    "episode_id": episode_id,
                    "reason": f"Missing required fields (robot_id={robot_id!r}, task_name={task_name!r}, operator_name={operator_name!r})",
                })
                continue

            # 3. Parse and validate recorded_at
            recorded_at = parse_datetime(recorded_at_raw)
            if not recorded_at:
                report["skipped_count"] += 1
                report["errors"].append({
                    "row": row_idx,
                    "episode_id": episode_id,
                    "reason": f"Invalid recorded_at timestamp: '{recorded_at_raw}'",
                })
                continue

            # 4. Parse and validate duration
            duration = parse_duration(duration_raw)
            if duration is None:
                report["skipped_count"] += 1
                report["errors"].append({
                    "row": row_idx,
                    "episode_id": episode_id,
                    "reason": f"Invalid duration_seconds: '{duration_raw}' (must be positive number)",
                })
                continue

            # 5. Parse and validate quality
            quality = clean_quality(quality_raw)
            if not quality:
                report["skipped_count"] += 1
                report["errors"].append({
                    "row": row_idx,
                    "episode_id": episode_id,
                    "reason": f"Invalid quality: '{quality_raw}' (must be 'good', 'usable', or 'bad')",
                })
                continue

            # 6. Save or update record (Idempotent)
            _, created = Episode.objects.update_or_create(
                episode_id=episode_id,
                defaults={
                    "robot_id": robot_id,
                    "task_name": task_name,
                    "recorded_at": recorded_at,
                    "duration_seconds": duration,
                    "operator_name": operator_name,
                    "quality": quality,
                },
            )

            if created:
                report["imported_count"] += 1
            else:
                report["updated_count"] += 1

    finally:
        if should_close:
            f.close()

    return report
