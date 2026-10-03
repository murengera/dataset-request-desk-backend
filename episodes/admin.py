from django.contrib import admin
from .models import Episode


@admin.register(Episode)
class EpisodeAdmin(admin.ModelAdmin):
    list_display = ("episode_id", "robot_id", "task_name", "recorded_at", "duration_seconds", "quality", "operator_name")
    list_filter = ("quality", "robot_id", "task_name")
    search_fields = ("episode_id", "task_name", "operator_name", "robot_id")
