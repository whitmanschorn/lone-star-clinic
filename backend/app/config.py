from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo-root .env is shared with docker compose. It is optional: every
# setting has a default that matches .env.example.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra="ignore")

    postgres_host: str = "localhost"
    postgres_port: int = 5433
    postgres_user: str = "clinic"
    postgres_password: str = "clinic"
    postgres_db: str = "clinic"
    # Set to override the POSTGRES_* pieces above with a full SQLAlchemy URL.
    database_url: str | None = None

    cors_origins: list[str] = ["http://localhost:5180", "http://localhost:8080"]

    log_level: str = "INFO"

    # --- Patient summaries -------------------------------------------------
    # Who writes the narrative: "auto" uses the first provider below that has
    # an API key and the built-in template when none does; a provider name
    # makes that one the default; "template" turns LLM summaries off entirely,
    # so no patient data leaves the server.
    summary_provider: Literal["auto", "template", "deepseek", "openai", "anthropic"] = "auto"
    # How long to wait for a provider before falling back to the template.
    summary_timeout_seconds: float = 30.0

    deepseek_api_key: SecretStr | None = None
    deepseek_model: str = "deepseek-flash"  # DeepSeek V4.1 Flash
    deepseek_base_url: str = "https://api.deepseek.com"

    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-6-luna"

    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-opus-5"

    # Used wherever a timestamp has to be shown as a calendar date, e.g. the
    # dates quoted in a patient summary.
    clinic_timezone: str = "America/Chicago"

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
