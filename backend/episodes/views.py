import io
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from users.permissions import IsOperatorUser
from .importer import import_episodes_from_csv
from .models import Episode
from .serializers import EpisodeSerializer


class EpisodeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing and retrieving episodes.
    Supports filtering by task_name, quality, robot_id, and unassigned_only.
    """
    queryset = Episode.objects.all().select_related("assignment")
    serializer_class = EpisodeSerializer
    permission_classes = [IsOperatorUser]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Query parameter filter
        task_name = self.request.query_params.get("task_name")
        quality = self.request.query_params.get("quality")
        robot_id = self.request.query_params.get("robot_id")
        unassigned_only = self.request.query_params.get("unassigned_only")

        if task_name:
            queryset = queryset.filter(task_name__icontains=task_name.strip())
        if quality:
            queryset = queryset.filter(quality=quality.strip().lower())
        if robot_id:
            queryset = queryset.filter(robot_id=robot_id.strip())
        if unassigned_only and unassigned_only.lower() in ("true", "1", "yes"):
            queryset = queryset.filter(assignment__isnull=True)

        return queryset

    @action(detail=False, methods=["post"], permission_classes=[IsOperatorUser])
    def import_csv(self, request):
        """
        Endpoint to upload and import a CSV file of episodes.
        """
        csv_file = request.FILES.get("file")
        if not csv_file:
            return Response(
                {"error": "Please provide a 'file' parameter with the CSV upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Read decoded text from uploaded in-memory file
            decoded_file = io.StringIO(csv_file.read().decode("utf-8-sig"))
            report = import_episodes_from_csv(decoded_file)
            return Response(report, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response(
                {"error": f"Failed to parse CSV file: {str(exc)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
