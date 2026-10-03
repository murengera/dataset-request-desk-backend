from rest_framework.permissions import BasePermission


class IsClientUser(BasePermission):
    """Allows access only to authenticated users with the 'client' role."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "client")


class IsOperatorUser(BasePermission):
    """Allows access to operators and admins."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role in ("operator", "admin") or request.user.is_superuser)
        )


class IsAdminUser(BasePermission):
    """Allows access only to admins or superusers."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == "admin" or request.user.is_superuser)
        )
