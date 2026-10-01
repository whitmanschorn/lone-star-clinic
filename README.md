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

## API

Interactive docs are at `http://localhost:8000/docs`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | `{"status": "ok"}` |
| `GET` | `/patients` | Paginated list. Query: `page`, `page_size` (1-100), `q`, `status`, `sort`, `order` |
| `GET` | `/patients/stats` | Counts by status, for the dashboard |
| `GET` | `/patients/{id}` | |
| `POST` | `/patients` | `201` with a `Location` header |
| `PUT` | `/patients/{id}` | Replaces the whole record |
| `DELETE` | `/patients/{id}` | `204`; also deletes the patient's notes |
| `GET` | `/patients/{id}/notes` | All notes, newest first |
| `POST` | `/patients/{id}/notes` | Body: `content`, optional `timestamp` (defaults to now), optional `changes` (see below). `201` |
| `DELETE` | `/patients/{id}/notes/{note_id}` | `204` |
| `GET` | `/patients/{id}/summary` | Generated summary of the profile and notes |

- **List response:** `{ items, total, page, page_size, pages }`.
- **Search** (`q`) is a case-insensitive substring match on full name and email. `%` and `_` are
  treated as plain text.
- **Sort** is one of `name`, `age`, `last_visit`, `status` (by urgency), with `order` `asc` or
  `desc`. Ties fall back to name and then id, so paging never repeats or skips a row.
- **Errors:** `404` with `{"detail": "Patient not found"}` for unknown ids, and `422` with
  FastAPI's per-field error list for invalid input (including ids that are not UUIDs).

### Updating the chart with a note

A note can carry `changes` to the patient's conditions, medications and allergies, so the
record is updated in the same step as the note that explains why:

```json
{
  "content": "BP still high. Doubling the dose and adding a statin.",
  "changes": [
    { "field": "medications", "action": "update",
      "value": "Lisinopril 10 mg daily", "new_value": "Lisinopril 20 mg daily" },
    { "field": "medications", "action": "add", "value": "Atorvastatin 20 mg nightly" }
  ]
}
```

- `field` is `conditions`, `medications` or `allergies`; `action` is `add`, `update` or `remove`.
- Changes are applied in order and saved with the note in one transaction: all or nothing.
- Existing entries are matched case-insensitively. A change that does not fit the chart as it
  stands (adding a duplicate, updating or removing something that is not there) returns `409`
  with a message, and nothing is saved.
- Each note keeps the changes it made, and the summary narrative mentions them. Deleting a note
  later does not undo them.

### Patient summary

`GET /patients/{id}/summary` returns the identifiers (name, age, blood type), the clinical
information (conditions, allergies), a `narrative` built from the notes, and `summary`, the
whole thing as plain text. Medications are included alongside conditions and allergies.

The generator is a template (`backend/app/summary.py`), not an LLM: it is deterministic, needs
no API key, and can be tested exactly. The narrative walks the notes in date order, quoting the
first, the latest and up to three in between, and counts the rest so a long history stays
readable. It is a single pure function, so an LLM-backed version can be swapped in behind the
same signature. Dates in the narrative use the clinic's time zone (`CLINIC_TIMEZONE`).

## Frontend

| Route | Page |
|---|---|
| `/` | Dashboard: counts, critical patients, recent visits |
| `/patients` | Patient list: search, status filter, sorting, pagination |
| `/patients/:id` | Patient record, in three tabs: Overview, Notes (add, with optional chart updates, and delete), Summary |
| anything else | 404 page |

- **Large lists:** searching, filtering, sorting and paging all happen in the database, so the
  browser only ever holds one page of rows.
- **Non-blocking search:** the input updates instantly from local state; the request is
  debounced, and SWR keeps the previous rows on screen (dimmed) until the new ones arrive.
- **Responsive:** below 768px the sidebar becomes a drawer and the table becomes a list of
  cards with a sort picker.
- **State:** the list's search, filter, sort and page live in a Redux slice, so they survive a
  visit to a patient and the sidebar's status shortcuts can drive the list. Everything fetched
  from the API is cached by SWR.

## Database

- **Schema:** Alembic migrations in `backend/migrations/versions`. `python -m app.prestart`
  applies them; `alembic upgrade head` does the same by hand.
- **Seed data:** `backend/app/seed_data.py` holds 24 hand-written patients and
  `backend/app/seed.py` adds 100 more with a plain loop (no randomness), so the list has enough
  rows to page through. Seeding only runs when the `patients` table is empty.
  Nine of the hand-written patients also come with clinical notes.
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
dropped, migrated and seeded on every run, plus its own build of the frontend on port 5181. Tests never
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
