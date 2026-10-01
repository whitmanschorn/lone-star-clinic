# Lone Star Clinic

A patient management dashboard for a (fictional) Texas medical practice: a React + TypeScript
frontend, a FastAPI backend and PostgreSQL.

> Work in progress. This README grows with each part of the exercise; the full
> docker compose quick start arrives with Part 5.

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19, Vite, Mantine 9 | Accessible components and a responsive app shell out of the box |
| Server state | SWR | Caching, revalidation and request de-duplication for API data |
| Client state | Redux Toolkit | UI state that must outlive a page, such as the patient list's search and paging |
| Routing | React Router | |
| API types | `openapi-typescript` + `openapi-fetch` | Frontend types are generated from the backend's OpenAPI document, so there is one source of truth |
| API | FastAPI, SQLModel, psycopg 3 | The stack FastAPI's own docs and project template use |
| Migrations | Alembic | Versioned schema that any developer can recreate |
| Tests | Playwright | One tool for API tests (request fixture) and browser tests |
| Lint and format | ESLint (type-checked) + Prettier, Ruff | |

## Running locally

Prerequisites: Docker, Node 22+, Python 3.11+.

```sh
# 1. Database (Postgres 17 in Docker, published on localhost:5433)
docker compose up -d db

# 2. Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m app.prestart          # wait for db, run migrations, seed
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000, docs at /docs

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                               # http://localhost:5180
```

No `.env` file is needed: every setting has a default. To change one, copy `.env.example` to
`.env`.

The frontend calls the API at the relative path `/api`, which the Vite dev server proxies to
`localhost:8000`. The backend itself serves the routes at its root, e.g. `GET /health`.

## Database

- **Schema:** Alembic migrations in `backend/migrations/versions`. `python -m app.prestart`
  applies them; `alembic upgrade head` does the same by hand.
- **Seed data:** `backend/app/seed_data.py` holds 24 hand-written patients and
  `backend/app/seed.py` adds 100 more with a plain loop (no randomness), so the list has enough
  rows to page through. Seeding only runs when the `patients` table is empty.
- **Start over:** `docker compose down -v` deletes the database volume.

## Tests and checks

From the repo root:

```sh
npm install
npx playwright install chromium   # first time only
npm test                          # API + desktop + mobile projects
npm run lint                      # ESLint, Prettier, Ruff
npm run typecheck
```

`npm test` starts its own API on port 8001 against a separate `clinic_test` database, which is
dropped, migrated and seeded on every run, plus its own Vite server on port 5181. Tests never
touch your development data. The database container must be running.

## Regenerating API types

After changing a request or response model in the backend:

```sh
npm run gen:types   # writes frontend/src/api/schema.d.ts
```

## Layout

```
backend/     FastAPI app (app/), Alembic migrations, seed data
frontend/    Vite + React app (src/)
e2e/         Playwright tests: api/ and ui/
scripts/     Helper used by the test runner
```
