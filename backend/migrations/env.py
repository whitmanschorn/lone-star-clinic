import logging
from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

from app import models  # noqa: F401  (registers the tables on SQLModel.metadata)
from app.config import get_settings
from app.db import engine

config = context.config

# Only apply alembic.ini's logging when nothing has configured logging yet
# (i.e. the alembic CLI). When called from app.prestart, keep the app's setup.
if config.config_file_name is not None and not logging.getLogger().handlers:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it (`alembic upgrade head --sql`)."""
    context.configure(
        url=get_settings().sqlalchemy_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
