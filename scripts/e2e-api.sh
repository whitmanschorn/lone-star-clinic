#!/usr/bin/env sh
# Start a throwaway API for the end-to-end tests.
#
# It runs on its own port against its own database (clinic_test), which is
# dropped, migrated and seeded on every start. Tests therefore always see the
# same data and never touch the development database.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

export DATABASE_URL="postgresql+psycopg://${POSTGRES_USER:-clinic}:${POSTGRES_PASSWORD:-clinic}@localhost:${POSTGRES_PORT:-5433}/clinic_test"

cd backend
PYTHONPATH=. .venv/bin/python scripts/recreate_test_db.py
.venv/bin/python -m app.prestart
exec .venv/bin/uvicorn app.main:app --port "${E2E_API_PORT:-8001}"
