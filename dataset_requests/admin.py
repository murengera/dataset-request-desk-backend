from django.contrib import admin
from .models import Request, Assignment, RequestStatusHistory


@admin.register(Request)
class RequestAdmin(admin.ModelAdmin):
    list_display = ("id", "client", "task_name", "episodes_requested", "deadline", "status", "created_at")
    list_filter = ("status", "deadline")
    search_fields = ("task_name", "client__username", "client__email")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "episode", "assigned_by", "assigned_at")
    search_fields = ("request__task_name", "episode__episode_id")


@admin.register(RequestStatusHistory)
class RequestStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "old_status", "new_status", "changed_by", "changed_at")
    list_filter = ("new_status", "changed_at")
