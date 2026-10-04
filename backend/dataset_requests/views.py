from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from episodes.models import Episode
from users.permissions import IsClientUser, IsOperatorUser
from .exceptions import WorkflowError, AuthorizationError, AssignmentError
from .models import Request, Assignment
from .serializers import (
    RequestSerializer,
    RequestCreateSerializer,
    AssignmentSerializer,
)
from .services import (
    create_request,
    transition_request_status,
    assign_episode_to_request,
    unassign_episode_from_request,
)


class RequestViewSet(viewsets.ModelViewSet):
    """
    Main ViewSet for managing Requests and their lifecycle.
    - Clients can list only their own requests, create requests, and accept/reject delivered ones.
    - Operators and Admins can view all requests, transition status, and assign/unassign episodes.
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return RequestCreateSerializer
        return RequestSerializer

    def get_queryset(self):
        user = self.request.user
        base_qs = Request.objects.select_related("client").prefetch_related(
            "assignments__episode",
            "assignments__assigned_by",
            "status_history__changed_by",
        )
        if user.role == "client":
            return base_qs.filter(client=user)
        return base_qs.all()

    def create(self, request, *args, **kwargs):
        """Create a new request owned by the requesting client."""
        serializer = RequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            new_req = create_request(
                client_user=request.user,
                task_name=serializer.validated_data["task_name"],
                episodes_requested=serializer.validated_data["episodes_requested"],
                deadline=serializer.validated_data["deadline"],
                notes=serializer.validated_data.get("notes", ""),
            )
            output_serializer = RequestSerializer(new_req)
            return Response(output_serializer.data, status=status.HTTP_201_CREATED)
        except AuthorizationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        """
        Transition request status.
        Body: { "status": "in_progress" | "delivered" | "accepted" | "rejected" }
        """
        req_obj = self.get_object()
        new_status = request.data.get("status")
        notes = request.data.get("notes")

        if not new_status:
            return Response({"error": "Missing 'status' in request body."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            updated_req = transition_request_status(
                request=req_obj,
                new_status=new_status,
                user=request.user,
                notes=notes,
            )
            return Response(RequestSerializer(updated_req).data, status=status.HTTP_200_OK)
        except WorkflowError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except AuthorizationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """
        Assign an episode to this request.
        Body: { "episode_id": "EP-00156" } or { "episode_pk": 12 }
        """
        req_obj = self.get_object()
        ep_id_str = request.data.get("episode_id")
        ep_pk = request.data.get("episode_pk")

        if ep_pk:
            episode = get_object_or_404(Episode, pk=ep_pk)
        elif ep_id_str:
            episode = get_object_or_404(Episode, episode_id=ep_id_str.strip())
        else:
            return Response(
                {"error": "Please provide 'episode_id' or 'episode_pk'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            assignment = assign_episode_to_request(
                request=req_obj,
                episode=episode,
                user=request.user,
            )
            return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)
        except (AssignmentError, WorkflowError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except AuthorizationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    @action(detail=True, methods=["post"])
    def unassign(self, request, pk=None):
        """
        Remove an assigned episode from this request.
        Body: { "episode_id": "EP-00156" } or { "assignment_id": 4 }
        """
        req_obj = self.get_object()
        assignment_id = request.data.get("assignment_id")
        ep_id_str = request.data.get("episode_id")

        if assignment_id:
            assignment = get_object_or_404(Assignment, pk=assignment_id, request=req_obj)
        elif ep_id_str:
            assignment = get_object_or_404(Assignment, episode__episode_id=ep_id_str.strip(), request=req_obj)
        else:
            return Response(
                {"error": "Please provide 'assignment_id' or 'episode_id'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            unassign_episode_from_request(assignment, request.user)
            return Response({"message": "Episode unassigned successfully."}, status=status.HTTP_200_OK)
        except AuthorizationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


from rest_framework.decorators import api_view, permission_classes
from .analytics import get_analytics_data


@api_view(["GET"])
@permission_classes([IsOperatorUser])
def analytics_view(request):
    """
    Analytics endpoint returning database aggregations for a given date range:
    - ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")

    try:
        data = get_analytics_data(start_date=start_date, end_date=end_date)
        return Response(data, status=status.HTTP_200_OK)
    except ValueError as exc:
        return Response(
            {"error": f"Invalid date format (expected YYYY-MM-DD): {str(exc)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
