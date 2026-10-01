from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from app.config import get_settings
from app.routers import health


def operation_id(route: APIRoute) -> str:
    """Use the endpoint function's name, so generated clients read naturally."""
    return route.name


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
    app.include_router(health.router)
    return app


app = create_app()
