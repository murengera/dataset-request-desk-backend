import statistics
from datetime import datetime, time, timedelta
from django.db.models import Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from episodes.models import Episode
from .models import Request, RequestStatusHistory


def get_analytics_data(start_date=None, end_date=None):
    """
    Computes analytics for a given date range using database aggregation:
    1. Episodes recorded per day, per robot.
    2. Request fulfilment counts by status, and median time from submitted to delivered.
    3. Top 5 task names by number of 'good' episodes.
    """
    now = timezone.now()

    # Default to last 30 days if not provided
    if not end_date:
        end_date = now.date()
    elif isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    if not start_date:
        start_date = end_date - timedelta(days=30)
    elif isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()

    # Make datetime bounds
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min))
    end_dt = timezone.make_aware(datetime.combine(end_date, time.max))

    # --- 1. Episodes recorded per day, per robot (Database TruncDate + Group By) ---
    episodes_by_day_robot_qs = (
        Episode.objects.filter(recorded_at__range=(start_dt, end_dt))
        .annotate(day=TruncDate("recorded_at"))
        .values("day", "robot_id")
        .annotate(count=Count("id"))
        .order_by("day", "robot_id")
    )
    episodes_per_day_robot = [
        {
            "day": item["day"].strftime("%Y-%m-%d") if item["day"] else "",
            "robot_id": item["robot_id"],
            "count": item["count"],
        }
        for item in episodes_by_day_robot_qs
    ]

    # --- 2. Request fulfilment: counts by status ---
    status_counts_qs = (
        Request.objects.filter(created_at__range=(start_dt, end_dt))
        .values("status")
        .annotate(count=Count("id"))
    )
    status_counts = {item["status"]: item["count"] for item in status_counts_qs}
    # Ensure all statuses have at least 0 count
    for status_choice, _ in Request.Status.choices:
        status_counts.setdefault(status_choice, 0)

    # Median time from submitted to delivered
    delivery_history_qs = (
        RequestStatusHistory.objects.filter(
            new_status=Request.Status.DELIVERED,
            request__created_at__range=(start_dt, end_dt),
        )
        .annotate(
            duration=ExpressionWrapper(
                F("changed_at") - F("request__created_at"),
                output_field=DurationField(),
            )
        )
        .values_list("duration", flat=True)
    )

    durations_seconds = [
        d.total_seconds() for d in delivery_history_qs if d is not None and d.total_seconds() >= 0
    ]

    median_duration_seconds = (
        round(statistics.median(durations_seconds), 2) if durations_seconds else None
    )

    # --- 3. Top 5 task names by number of 'good' episodes (Database Group By + Limit) ---
    top_tasks_qs = (
        Episode.objects.filter(
            quality=Episode.Quality.GOOD,
            recorded_at__range=(start_dt, end_dt),
        )
        .values("task_name")
        .annotate(good_count=Count("id"))
        .order_by("-good_count")[:5]
    )
    top_5_tasks = [
        {"task_name": item["task_name"], "good_episodes_count": item["good_count"]}
        for item in top_tasks_qs
    ]

    return {
        "date_range": {
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
        },
        "episodes_per_day_per_robot": episodes_per_day_robot,
        "request_fulfilment": {
            "counts_by_status": status_counts,
            "median_time_to_delivery_seconds": median_duration_seconds,
            "median_time_to_delivery_human": (
                f"{round(median_duration_seconds / 3600, 2)} hours"
                if median_duration_seconds is not None
                else "N/A (No delivered requests in range)"
            ),
        },
        "top_5_tasks_by_good_episodes": top_5_tasks,
    }
