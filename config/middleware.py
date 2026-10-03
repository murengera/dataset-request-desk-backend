import json
import logging
import time

logger = logging.getLogger("structured_logger")


class StructuredLoggingMiddleware:
    """
    Middleware that outputs one structured log line per HTTP request:
    - method: HTTP verb (GET, POST, etc.)
    - path: Request URI path
    - status: HTTP response status code
    - duration_ms: Request processing time in milliseconds
    - user_id: ID of authenticated user (or None if anonymous)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.monotonic()

        response = self.get_response(request)

        duration_ms = round((time.monotonic() - start_time) * 1000, 2)

        user_id = request.user.id if getattr(request, "user", None) and request.user.is_authenticated else None

        log_data = {
            "method": request.method,
            "path": request.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
        }

        # Log as structured JSON string
        logger.info(json.dumps(log_data))

        return response
