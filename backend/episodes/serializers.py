from rest_framework import serializers
from .models import Episode


class EpisodeSerializer(serializers.ModelSerializer):
    is_assigned = serializers.SerializerMethodField()
    assigned_request_id = serializers.SerializerMethodField()

    class Meta:
        model = Episode
        fields = [
            "id",
            "episode_id",
            "robot_id",
            "task_name",
            "recorded_at",
            "duration_seconds",
            "operator_name",
            "quality",
            "created_at",
            "is_assigned",
            "assigned_request_id",
        ]

    def get_is_assigned(self, obj):
        return hasattr(obj, "assignment")

    def get_assigned_request_id(self, obj):
        if hasattr(obj, "assignment"):
            return obj.assignment.request_id
        return None
