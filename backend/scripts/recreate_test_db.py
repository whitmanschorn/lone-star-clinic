"""Drop and recreate the database named in DATABASE_URL.

Used by the end-to-end tests to start every run from a clean, freshly seeded
database. As a safety catch it refuses to touch any database whose name does
not end in "_test".
"""

import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import get_settings


def main() -> None:
    url = make_url(get_settings().sqlalchemy_url)
    name = url.database
    if not name or not name.endswith("_test"):
        sys.exit(f"Refusing to recreate {name!r}: the database name must end in '_test'.")

    admin_engine = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    print(f"Recreated database {name}")


if __name__ == "__main__":
    main()
