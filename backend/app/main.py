import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.config import get_settings
from app.routers import health, patients

logger = logging.getLogger(__name__)


def operation_id(route: APIRoute) -> str:
    """Use the endpoint function's name, so generated clients read naturally."""
    return route.name


async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Log unexpected errors and answer in the same JSON shape as other errors."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        {"detail": "Internal server error"}, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


def create_app() -> FastAPI:
    settings = get_settings()
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
    app.add_exception_handler(Exception, unhandled_error)
    app.include_router(health.router)
    app.include_router(patients.router)
    return app


app = create_app()
