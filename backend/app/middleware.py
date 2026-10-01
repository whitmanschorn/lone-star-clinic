"""Request logging middleware."""

import logging
import re
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.log import request_id_var

logger = logging.getLogger("app.access")

REQUEST_ID_HEADER = "X-Request-ID"

# An inbound request id is only trusted if it is short and plain. Anything
# else (spaces, newlines, very long values) could be used to forge log lines.
_SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")

# Polled every few seconds by health checks; logged at DEBUG to keep the log readable.
QUIET_PATHS = frozenset({"/health"})


class RequestLoggingMiddleware:
    """Log one line per request and give every request an id.

    The line records the method, path, status, duration and client address.
    The query string is deliberately left out: searches contain patient names,
    which do not belong in logs.

    The request id comes from the X-Request-ID header when a proxy has set a
    sensible one, and is generated otherwise. It is returned in the response,
    added to every log line written while the request is handled, and kept in
    `request.state.request_id`.

    This is a plain ASGI middleware rather than BaseHTTPMiddleware, so it adds
    no buffering and sees the real status of streamed responses.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inbound = Headers(scope=scope).get(REQUEST_ID_HEADER, "")
        request_id = inbound if _SAFE_REQUEST_ID.fullmatch(inbound) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)

        # If the app raises before responding, the server answers 500.
        status = 500
        started = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            client = scope.get("client")
            if status >= 500:
                level = logging.ERROR
            elif scope["path"] in QUIET_PATHS:
                level = logging.DEBUG
            else:
                level = logging.INFO
            logger.log(
                level,
                "method=%s path=%s status=%d duration_ms=%.1f client=%s",
                scope["method"],
                scope["path"],
                status,
                duration_ms,
                client[0] if client else "-",
            )
            request_id_var.reset(token)
