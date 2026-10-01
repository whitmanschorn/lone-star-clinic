# Lone Star Clinic

A patient management dashboard for a (fictional) Texas medical practice: a React + TypeScript
frontend, a FastAPI backend and PostgreSQL.

## Quick start

Requires Docker with Compose.

```sh
docker compose up --build
```

| | |
|---|---|
| Web app | http://localhost:8080 |
| API | http://localhost:8000 (`GET /health`, interactive docs at `/docs`) |
| Postgres | `localhost:5433`, user, password and database all `clinic` |

The first start runs the database migrations and seeds 124 sample patients, 9 of them with
clinical notes. No `.env` file is needed. To change a port or credential, copy `.env.example`
to `.env` and edit it. `docker compose down -v` stops everything and deletes the data.

## What it does

- **Dashboard:** headline counts, charts of patients by status, by age and by condition,
  critical patients and recent visits.
- **Patient list:** server-side search, status filter, sorting and numbered pages over 100+
  patients; a table on desktop and cards on phones.
- **Working from the list:** create and edit patients and add notes in modals, without leaving
  the list.
- **Patient record:** contact and medical details, clinical notes, and a generated summary.
- **Notes that update the chart:** a note can add, update or remove a condition, medication or
  allergy in the same step.

## Stack and decisions

| Layer | Choice | Why |
|---|---|---|
| UI | React 19, Vite, Mantine 9 | Accessible components and a responsive app shell out of the box |
| Server state | SWR | Caching, de-duplication and stale-while-revalidate for API data |
| Client state | Redux Toolkit | UI state that outlives a page: the list's search, sort and paging, and which modal is open |
| Routing | React Router | |
| API types | `openapi-typescript` + `openapi-fetch` | Frontend types are generated from the backend's OpenAPI document, so the API schema is the single source of truth |
| Forms | `@mantine/form` + zod | One schema validates in the browser and is type-checked against the generated request type |
| API | FastAPI, SQLModel, psycopg 3 | The stack FastAPI's own docs and project template use |
| Migrations | Alembic | A versioned schema any developer can recreate |
| Tests | Playwright | One tool for API tests (request fixture) and browser tests on desktop and mobile |
| Lint and format | ESLint (type-checked) + Prettier, Ruff | |
| Serving | nginx | Serves the built frontend and proxies `/api` to the backend, so the browser sees one origin |

Trade-offs worth knowing about:

- **Template summary by default, LLM optional.** The template is deterministic, testable and
  runs without an API key. An LLM writes only the narrative, only when a key is set, and any
  failure falls back to the template.
- **Sync SQLAlchemy.** Plain `def` endpoints on FastAPI's thread pool, as in FastAPI's
  tutorial. Simpler to read and test; an async engine would be the change to make if
  long-lived connections (websockets, streaming) arrive.
- **Substring search.** `ILIKE` over name and email is fine at this size. The next step would
  be a trigram index (`pg_trgm`).
- **Last write wins.** Two people editing the same patient overwrite each other. The edit form
  reloads the latest record when it opens, which narrows the window; a version check on `PUT`
  would close it.
- **No authentication.** Out of scope here, and the first thing a real deployment would need.

## Stretch goals

| Goal | Where |
|---|---|
| Unit tests for API endpoints | `e2e/api` (Playwright against the real API and database), `backend/tests` (pytest) |
| E2E tests for main user journeys | `e2e/ui`, on desktop and mobile |
| Request logging middleware | `backend/app/middleware.py`; see [Request logging](#request-logging) |
| Sorting and filtering query parameters | `backend/app/patient_query.py` |
| Database migrations with Alembic | `backend/migrations` |
| Dark and light theme switching | `frontend/src/components/ColorSchemeToggle.tsx` |
| Advanced search with filters, bookmarkable in the URL | `frontend/src/components/patients/PatientFilterPanel.tsx`, `frontend/src/lib/usePatientListUrlSync.ts` |
| Data visualization on the dashboard | `frontend/src/components/charts` |
| LLM-written summaries (DeepSeek, OpenAI or Anthropic), optional with fallback | `backend/app/llm.py`, `backend/app/narrative.py`; see [Patient summary](#patient-summary) |
| Memoised rows | `PatientTable.tsx`, `PatientCards.tsx` |

## Development without Docker for the app

Prerequisites: Docker (for Postgres only), Node 22+, Python 3.11+.

```sh
# 1. Database (Postgres 17, published on localhost:5433)
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

The frontend calls the API at the relative path `/api`, which the Vite dev server proxies to
`localhost:8000`. The backend itself serves the routes at its root, e.g. `GET /health`.

## API

Interactive docs are at http://localhost:8000/docs.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | `{"status": "ok"}` |
| `GET` | `/patients` | Paginated list. Query: `page`, `page_size` (1-100), `sort`, `order`, `q`, `status`, plus the filters below |
| `GET` | `/patients/stats` | Dashboard aggregates: counts by status and by age band, and the most common conditions |
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
- **Filters** combine with AND: `min_age` and `max_age`, `blood_type` (repeat it for several),
  `last_visit_from` and `last_visit_to` (inclusive dates), and `condition`, `medication`,
  `allergy` and `city`, which match part of an entry, ignoring case. A range given the wrong
  way round is a `422`.
- **Sort** is one of `name`, `age`, `last_visit`, `last_note`, `status` (by urgency), with
  `order` `asc` or `desc`. Patients with no visit or no note sort last either way. Ties fall
  back to name (A to Z) and then id, so paging never repeats or skips a row.
- **Last note:** every patient carries `last_note` (`id`, `timestamp` and a short `excerpt`),
  or `null`, so a list can show it without a request per row.
- **Errors:** `404` with `{"detail": "Patient not found"}` for unknown ids, and `422` with
  FastAPI's per-field error list for invalid input (including ids that are not UUIDs).

### Request logging

Every request is logged on one line by an ASGI middleware (`backend/app/middleware.py`):

```
2026-10-01 11:44:28,964 INFO [app.access] [from-proxy-123] method=GET path=/patients/stats status=200 duration_ms=16.8 client=172.18.0.4
```

- **Request id:** each request gets an id, returned in the `X-Request-ID` response header and
  stamped on every log line written while the request is handled, so one request can be
  followed through the log. An id supplied by a proxy is kept if it is short and plain (nginx
  sets one in the compose stack); anything else is replaced, so a caller cannot forge log lines.
- **No query strings:** searches contain patient names, which do not belong in logs.
- **Levels:** `5xx` responses are logged at `ERROR` and health checks at `DEBUG`; everything
  else at `INFO`. Set `LOG_LEVEL` to change what is shown.
- Behind nginx, `client` is the proxy's address.

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
information (conditions, medications, allergies), a `narrative` built from the notes, and
`summary`, the whole thing as plain text.

The identifiers and clinical information always come straight from the record. The narrative
has two possible authors:

- **The built-in template** (`backend/app/summary.py`), the default. It is deterministic, needs
  no API key and can be tested exactly. It walks the notes in date order, quoting the first,
  the latest and up to three in between, and counts the rest so a long history stays readable.
- **An LLM**, when you provide an API key for DeepSeek, OpenAI or Anthropic
  (`backend/app/llm.py`, `backend/app/narrative.py`).

To turn LLM summaries on, set one or more keys in `.env`:

```sh
DEEPSEEK_API_KEY=...     # model: DEEPSEEK_MODEL, default deepseek-flash (DeepSeek V4.1 Flash)
OPENAI_API_KEY=...       # model: OPENAI_MODEL
ANTHROPIC_API_KEY=...    # model: ANTHROPIC_MODEL, default claude-opus-5
SUMMARY_PROVIDER=auto    # auto | template | deepseek | openai | anthropic
```

- **Which provider:** `auto` uses the first of DeepSeek, OpenAI, Anthropic that has a key.
  Name a provider to make it the default. A request can also ask for any configured one with
  `?generator=deepseek` (or `template`); the summary tab offers the same choice.
- **Fallback:** if the provider fails for any reason (bad key, timeout, rate limit, refusal,
  empty answer) the response is the template summary, with `fallback_reason` saying why. The
  response always says who wrote the narrative (`generator`, `model`).
- **Caching:** an unchanged record is answered from an in-memory cache; `?refresh=true`
  (the Regenerate button) asks again.
- **Privacy:** enabling this sends patient data to the provider you chose: first name, age,
  status, conditions, medications, allergies and the notes. Surname, date of birth, contact
  details and address are not sent, and prompts are never logged. `SUMMARY_PROVIDER=template`
  turns LLM summaries off whatever keys are set, and no request can override it. The sample
  data is fictional; real patient data would need an agreement with the provider first.
- **What was verified:** the DeepSeek path was run against the real API. No OpenAI or
  Anthropic key was available, so those two paths have their default model ids checked
  against the providers' documentation and their requests covered by unit tests with a fake
  client, but have not been run live.

Dates in the narrative use the clinic's time zone (`CLINIC_TIMEZONE`).

## Frontend

| Route | Page |
|---|---|
| `/` | Dashboard: counts, charts, critical patients, recent visits |
| `/patients` | Patient list: search, status filter, sorting, pagination, and row actions to edit a patient or add a note |
| `/patients/new` | Create a patient (the same form, as a page, for direct links) |
| `/patients/:id/edit` | Edit a patient (likewise) |
| `/patients/:id` | Patient record, in three tabs: Overview, Notes (add, with optional chart updates, and delete), Summary |
| anything else | 404 page |

- **Large lists:** searching, filtering, sorting and paging all happen in the database, so the
  browser only ever holds one page of rows.
- **Non-blocking search:** the input updates instantly from local state; the request is
  debounced, and SWR keeps the previous rows on screen (dimmed) until the new ones arrive.
  The same holds for a change of filter, sort or page: loading placeholders appear only on
  the very first load.
- **Responsive:** below 768px the sidebar becomes a drawer and the table becomes a list of
  cards with a sort picker.
- **Dashboard charts:** three small charts, each chosen for what its data has to say: one
  stacked bar for patients by status (parts of a whole), columns for patients by age band, and
  horizontal bars for the most common conditions. Every mark links to the patient list
  filtered to match, shows its value on hover and on keyboard focus, and each chart can be
  switched to a table, so nothing depends on colour or on hovering. They are plain HTML and
  CSS (`frontend/src/components/charts`): three bar forms did not justify a charting library.
  Colours were checked for colour-blind separation and contrast in both colour schemes.
- **Advanced filters:** the Filters button opens a panel for age range, blood type, last-visit
  dates, condition, medication, allergy and city. Applied filters show as chips that can be
  removed one at a time.
- **Bookmarkable views:** the list's search, status, filters, sort, page and page size are
  mirrored into the URL (`/patients?status=critical&sort=age&order=desc&min_age=70`), so a
  view can be bookmarked, shared or reloaded. A hand-edited address is validated; anything
  invalid is dropped. The address is replaced, not pushed, so Back leaves the list rather than
  replaying each change (`frontend/src/lib/usePatientListUrlSync.ts`).
- **Dark and light mode:** follows the operating system until the user picks one with the
  toggle in the header (in the drawer on phones); the choice is remembered. A small inline
  script in `index.html` applies it before the app loads, so there is no flash of the wrong
  theme.
- **Working from the list:** "New patient", and each row's Edit and Add note, open a modal
  over the list, so several patients can be worked on without leaving it. The patient page's
  Edit button opens the same modal.
- **Stale-while-revalidate, made visible:** when a save succeeds, the server's copy is written
  straight into SWR's cache, so the record and any list row showing it change at once. SWR then
  refetches in the background, which settles sort order, filters and counts. While that runs,
  the list shows "Updating…" and dims its rows, and the changed row is highlighted briefly.
  The cache logic is in `frontend/src/api/hooks.ts` (`patientSaved`, `noteAdded`).
- **Forms:** one `PatientForm` serves create and edit, validated in the browser by a zod
  schema (`frontend/src/lib/patientForm.ts`) that mirrors the backend's rules and is typed
  against the generated `PatientCreate`. Fields are checked as you leave them and again on
  submit; empty optional fields are sent as `null`.
- **Errors:** the server validates everything again. Its `422` errors are shown on the fields
  they name, a `409` conflict or `5xx` is explained next to the form's buttons, and so is a
  network failure. The form keeps what was typed in every case, so retrying is pressing the button
  again. Failed page loads show a "Try again" button.
- **State:** Redux holds client-side UI state only: the list's search, filters, sort and page
  (so they survive a visit to a patient, and the sidebar's status shortcuts can drive the
  list), and which modal is open. The URL mirrors the list state rather than owning it. Everything fetched from the API is cached by SWR.

## Database

- **Schema:** Alembic migrations in `backend/migrations/versions`. The backend applies them on
  start (`python -m app.prestart`); `alembic upgrade head` does the same by hand.
- **Seed data:** `backend/app/seed_data.py` holds 24 hand-written patients, nine of them with
  clinical notes, and `backend/app/seed.py` adds 100 more with a plain loop (no randomness),
  so the list has enough rows to page through. Seeding only runs when the `patients` table is
  empty.
- **Start over:** `docker compose down -v` deletes the database volume.

## Tests and checks

From the repo root, with the database container running and the backend's `.venv` set up as
above:

```sh
npm install
npx playwright install chromium   # first time only
npm test                          # API + desktop + mobile projects
npm run test:unit                 # pytest unit tests for the backend (no database needed)
npm run lint                      # ESLint, Prettier, Ruff
npm run typecheck
```

`npm test` starts its own API on port 8001 against a separate `clinic_test` database, which is
dropped, migrated and seeded on every run, plus its own build of the frontend on port 5181.
Tests never touch your development data, and never call an LLM: the test API runs with
`SUMMARY_PROVIDER=template`, and the LLM code is unit-tested against a fake provider.

To run the same tests against the containers from the quick start instead:

```sh
E2E_BASE_URL=http://localhost:8080 E2E_API_URL=http://localhost:8000 npm test
```

## Regenerating API types

After changing a request or response model in the backend:

```sh
npm run gen:types   # writes frontend/src/api/schema.d.ts
```

## Layout

```
backend/              FastAPI app
  app/                  routers, models, summary generator, seed data
  migrations/           Alembic migrations
  Dockerfile
frontend/             Vite + React app
  src/api/              generated types, typed client, SWR hooks
  src/store/            Redux slices
  src/components/       layout, patient and note components
  src/pages/            one file per route
  Dockerfile, nginx.conf.template
e2e/                  Playwright tests: api/ and ui/
docker-compose.yml    db, backend, frontend
.env.example          every setting, with its default
```
