"""Prepare the database before the API starts: wait, migrate, seed.

Run as `python -m app.prestart`. It is safe to run on every start: migrations
are a no-op when the schema is current and seeding only fills an empty table.
"""

import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlmodel import Session

from app.db import engine
from app.seed import seed

logger = logging.getLogger(__name__)

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def wait_for_database(attempts: int = 30, delay_seconds: float = 1.0) -> None:
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt == attempts:
                raise
            logger.info("Database not ready (attempt %d/%d), retrying", attempt, attempts)
            time.sleep(delay_seconds)


def migrate() -> None:
    command.upgrade(Config(str(ALEMBIC_INI)), "head")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
    wait_for_database()
    migrate()
    with Session(engine) as session:
        seed(session)


if __name__ == "__main__":
    main()
