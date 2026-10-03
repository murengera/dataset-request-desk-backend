from django.db import transaction
from episodes.models import Episode
from .exceptions import WorkflowError, AuthorizationError, AssignmentError
from .models import Request, Assignment, RequestStatusHistory

# Map of allowed transitions: { current_status: [allowed_new_statuses] }
ALLOWED_TRANSITIONS = {
    Request.Status.SUBMITTED: [Request.Status.IN_PROGRESS],
    Request.Status.IN_PROGRESS: [Request.Status.DELIVERED],
    Request.Status.DELIVERED: [Request.Status.ACCEPTED, Request.Status.REJECTED],
    Request.Status.REJECTED: [Request.Status.IN_PROGRESS],
    Request.Status.ACCEPTED: [],  # Terminal state
}


def create_request(client_user, task_name, episodes_requested, deadline, notes=""):
    """
    Creates a new request for a client and logs the initial status history.
    """
    if not (client_user.role == "client" or client_user.role == "admin" or client_user.is_superuser):
        raise AuthorizationError("Only clients (or admins) can create dataset requests.")

    if episodes_requested <= 0:
        raise ValueError("episodes_requested must be greater than 0.")

    with transaction.atomic():
        request = Request.objects.create(
            client=client_user,
            task_name=task_name,
            episodes_requested=episodes_requested,
            deadline=deadline,
            notes=notes,
            status=Request.Status.SUBMITTED,
        )

        RequestStatusHistory.objects.create(
            request=request,
            old_status=None,
            new_status=Request.Status.SUBMITTED,
            changed_by=client_user,
        )

    return request


def transition_request_status(request, new_status, user):
    """
    Transitions a request to a new status while enforcing:
    1. Valid state transition paths.
    2. Role-based authorization rules.
    3. Fulfillment quota checks (cannot deliver without enough assigned episodes).
    4. Audit logging in RequestStatusHistory.
    """
    old_status = request.status

    # 1. Validate state transition path
    allowed = ALLOWED_TRANSITIONS.get(old_status, [])
    if new_status not in allowed:
        raise WorkflowError(
            f"Cannot transition request #{request.id} from '{old_status}' to '{new_status}'. "
            f"Allowed transitions: {allowed or 'none (terminal state)'}."
        )

    # 2. Validate Role-based authorization
    is_client_owner = (user == request.client and user.role == "client")
    is_operator_or_admin = (user.role in ("operator", "admin") or user.is_superuser)

    if new_status in (Request.Status.ACCEPTED, Request.Status.REJECTED):
        # Clients accept or reject deliveries for their own requests
        if not (is_client_owner or user.role == "admin" or user.is_superuser):
            raise AuthorizationError("Only the requesting client (or admin) can accept or reject a delivery.")
    else:
        # Operators move requests through workflow (in_progress, delivered, rework)
        if not is_operator_or_admin:
            raise AuthorizationError("Only operators (or admins) can perform this status transition.")

    # 3. Fulfillment validation rule: Must have assigned_count >= episodes_requested to deliver
    if new_status == Request.Status.DELIVERED:
        assigned_count = request.assignments.count()
        if assigned_count < request.episodes_requested:
            raise WorkflowError(
                f"Cannot deliver request #{request.id}. "
                f"Requires {request.episodes_requested} assigned episodes, but only {assigned_count} are assigned."
            )

    # 4. Apply status change and record audit history atomically
    with transaction.atomic():
        request.status = new_status
        request.save(update_fields=["status", "updated_at"])

        RequestStatusHistory.objects.create(
            request=request,
            old_status=old_status,
            new_status=new_status,
            changed_by=user,
        )

    return request


def assign_episode_to_request(request, episode, user):
    """
    Assigns an episode to a request while enforcing:
    1. User must be an operator or admin.
    2. Episode quality must be 'good' or 'usable'.
    3. Episode must not already be assigned to another request.
    """
    # 1. Authorization check
    if not (user.role in ("operator", "admin") or user.is_superuser):
        raise AuthorizationError("Only operators (or admins) can assign episodes to requests.")

    # 2. Quality check
    if episode.quality not in (Episode.Quality.GOOD, Episode.Quality.USABLE):
        raise AssignmentError(
            f"Cannot assign episode {episode.episode_id} with quality '{episode.quality}'. "
            "Only 'good' or 'usable' episodes can be assigned."
        )

    # 3. Check if episode is already assigned
    if hasattr(episode, "assignment"):
        raise AssignmentError(
            f"Episode {episode.episode_id} is already assigned to request #{episode.assignment.request_id}."
        )

    # 4. Create assignment
    assignment = Assignment.objects.create(
        request=request,
        episode=episode,
        assigned_by=user,
    )
    return assignment


def unassign_episode_from_request(assignment, user):
    """
    Removes an episode assignment from a request.
    """
    if not (user.role in ("operator", "admin") or user.is_superuser):
        raise AuthorizationError("Only operators (or admins) can unassign episodes.")

    assignment.delete()
