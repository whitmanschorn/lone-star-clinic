"""Logging setup, and the request id that ties a request's log lines together."""

import logging
from contextvars import ContextVar

# The id of the request being handled, or "-" outside a request. A context
# variable follows the request through async code and into the worker threads
# that run the endpoints.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] [%(request_id)s] %(message)s"

_configured = False


def configure_logging(level: str) -> None:
    """Send the application's logs to stderr, each line stamped with the request id."""
    global _configured
    if _configured:
        return
    _configured = True

    # Stamp every record, whichever logger made it, so the format above works
    # for library logs too (SQLAlchemy, Alembic, uvicorn's error log).
    create_record = logging.getLogRecordFactory()

    def create_record_with_request_id(*args, **kwargs) -> logging.LogRecord:
        record = create_record(*args, **kwargs)
        record.request_id = request_id_var.get()
        return record

    logging.setLogRecordFactory(create_record_with_request_id)

    # No effect if something else (a test runner, say) already set up the root logger.
    logging.basicConfig(level=level.upper(), format=LOG_FORMAT)

    # RequestLoggingMiddleware writes a fuller access line, so uvicorn's own
    # would only be a duplicate.
    logging.getLogger("uvicorn.access").disabled = True
