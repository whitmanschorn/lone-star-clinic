FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first, so editing the code does not reinstall them.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

# Run as an unprivileged user.
RUN useradd --uid 10001 --no-create-home clinic
USER clinic

EXPOSE 8000

HEALTHCHECK --interval=5s --timeout=3s --start-period=30s --retries=10 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"

# prestart waits for Postgres, applies migrations and seeds an empty database.
CMD ["sh", "-c", "python -m app.prestart && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
