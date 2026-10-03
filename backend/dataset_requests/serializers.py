from rest_framework import serializers
from episodes.serializers import EpisodeSerializer
from .models import Request, Assignment, RequestStatusHistory


class RequestStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", read_only=True)

    class Meta:
        model = RequestStatusHistory
        fields = [
            "id",
            "old_status",
            "new_status",
            "changed_by",
            "changed_by_name",
            "changed_at",
        ]
        read_only_fields = fields


class AssignmentSerializer(serializers.ModelSerializer):
    episode_details = EpisodeSerializer(source="episode", read_only=True)
    assigned_by_name = serializers.CharField(source="assigned_by.username", read_only=True)

    class Meta:
        model = Assignment
        fields = [
            "id",
            "request",
            "episode",
            "episode_details",
            "assigned_by",
            "assigned_by_name",
            "assigned_at",
        ]
        read_only_fields = ["id", "assigned_by", "assigned_at"]


class RequestSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.username", read_only=True)
    client_organisation = serializers.CharField(source="client.organisation", read_only=True)
    assigned_count = serializers.SerializerMethodField()
    assignments = AssignmentSerializer(many=True, read_only=True)
    status_history = RequestStatusHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Request
        fields = [
            "id",
            "client",
            "client_name",
            "client_organisation",
            "task_name",
            "episodes_requested",
            "deadline",
            "notes",
            "status",
            "assigned_count",
            "assignments",
            "status_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "client", "status", "created_at", "updated_at"]

    def get_assigned_count(self, obj):
        return obj.assignments.count()


class RequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Request
        fields = [
            "id",
            "task_name",
            "episodes_requested",
            "deadline",
            "notes",
        ]
