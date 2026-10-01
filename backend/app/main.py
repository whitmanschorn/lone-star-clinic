import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.config import get_settings
from app.log import configure_logging
from app.middleware import REQUEST_ID_HEADER, RequestLoggingMiddleware
from app.routers import health, notes, patients

logger = logging.getLogger(__name__)


def operation_id(route: APIRoute) -> str:
    """Use the endpoint function's name, so generated clients read naturally."""
    return route.name


async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Log unexpected errors and answer in the same JSON shape as other errors."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    # This response is sent from outside the logging middleware, so it adds
    # the request id itself. Quoting the id is how a user reports the failure.
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        {"detail": "Internal server error"},
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        headers={REQUEST_ID_HEADER: request_id} if request_id else None,
    )


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="Lone Star Clinic API",
        version="0.1.0",
        description="Patient management API for the Lone Star Clinic dashboard.",
        generate_unique_id_function=operation_id,
    )
    # The frontend normally reaches the API through a same-origin /api proxy,
    # so CORS only matters when a browser calls this server directly.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Added last, so it wraps CORS and the routes and times the whole request.
    app.add_middleware(RequestLoggingMiddleware)
    app.add_exception_handler(Exception, unhandled_error)
    app.include_router(health.router)
    app.include_router(patients.router)
    app.include_router(notes.router)
    return app


app = create_app()
