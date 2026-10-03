class WorkflowError(Exception):
    """Raised when an invalid status transition is attempted."""
    pass


class AuthorizationError(Exception):
    """Raised when a user attempts an action not permitted for their role."""
    pass


class AssignmentError(Exception):
    """Raised when an invalid episode assignment is attempted."""
    pass
