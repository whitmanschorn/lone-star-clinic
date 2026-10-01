import uuid
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import EmailStr, StringConstraints, computed_field, field_validator
from sqlalchemy import ARRAY, Column, DateTime, Index, String
from sqlmodel import Field, SQLModel


class BloodType(StrEnum):
    A_POS = "A+"
    A_NEG = "A-"
    B_POS = "B+"
    B_NEG = "B-"
    AB_POS = "AB+"
    AB_NEG = "AB-"
    O_POS = "O+"
    O_NEG = "O-"


class PatientStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    CRITICAL = "critical"


# SQLModel's Field() does not enforce patterns under Pydantic v2, so the
# formatted strings carry their constraint in the type instead.
Phone = Annotated[str, StringConstraints(pattern=r"^[0-9+().\-\s]{7,20}$")]
StateCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]
PostalCode = Annotated[str, StringConstraints(pattern=r"^\d{5}(-\d{4})?$")]


# For response-only models: every field is always present in a response, so
# mark fields with defaults as required in the OpenAPI schema. Generated
# clients then see `email: string | null` rather than `email?: string | null`.
RESPONSE_MODEL = {"json_schema_serialization_defaults_required": True}


def utcnow() -> datetime:
    return datetime.now(UTC)


def age_on(date_of_birth: date, today: date) -> int:
    had_birthday = (today.month, today.day) >= (date_of_birth.month, date_of_birth.day)
    return today.year - date_of_birth.year - (0 if had_birthday else 1)


def _clean_list(values: list[str]) -> list[str]:
    """Trim entries, drop blanks and case-insensitive duplicates, keep order."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        item = value.strip()
        if item and item.lower() not in seen:
            seen.add(item.lower())
            cleaned.append(item)
    return cleaned


class PatientBase(SQLModel):
    """Fields shared by the table, the request body and the response."""

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    date_of_birth: date

    email: EmailStr | None = Field(default=None, max_length=254)
    phone: Phone | None = Field(default=None, max_length=20)
    address_line: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: StateCode | None = Field(default=None, max_length=2)
    postal_code: PostalCode | None = Field(default=None, max_length=10)

    # Enums are stored as plain strings (their values, e.g. "A+"), not as
    # Postgres enum types, so adding a value never needs a type migration.
    blood_type: BloodType | None = Field(default=None, sa_type=String(3))
    status: PatientStatus = Field(default=PatientStatus.ACTIVE, sa_type=String(20))
    allergies: list[str] = Field(
        default_factory=list,
        max_length=50,
        sa_column=Column(ARRAY(String), nullable=False, server_default="{}"),
    )
    conditions: list[str] = Field(
        default_factory=list,
        max_length=50,
        sa_column=Column(ARRAY(String), nullable=False, server_default="{}"),
    )
    last_visit: date | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_is_plausible(cls, value: date) -> date:
        today = date.today()
        if value > today:
            raise ValueError("date of birth cannot be in the future")
        if age_on(value, today) > 130:
            raise ValueError("date of birth is too far in the past")
        return value

    @field_validator("last_visit")
    @classmethod
    def last_visit_not_in_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("last visit cannot be in the future")
        return value

    @field_validator("allergies", "conditions")
    @classmethod
    def clean_list(cls, values: list[str]) -> list[str]:
        cleaned = _clean_list(values)
        if any(len(item) > 100 for item in cleaned):
            raise ValueError("each entry must be at most 100 characters")
        return cleaned


class Patient(PatientBase, table=True):
    __tablename__ = "patients"
    __table_args__ = (Index("ix_patients_name", "last_name", "first_name"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: PatientStatus = Field(default=PatientStatus.ACTIVE, sa_type=String(20), index=True)
    last_visit: date | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": utcnow},
    )


class PatientCreate(PatientBase):
    """Request body for both POST and PUT: PUT replaces the whole record."""


class PatientPublic(PatientBase):
    model_config = RESPONSE_MODEL  # type: ignore[assignment]

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def age(self) -> int:
        return age_on(self.date_of_birth, date.today())


class PatientsPage(SQLModel):
    """One page of the patient list, plus what the client needs to page through it."""

    items: list[PatientPublic]
    total: int
    page: int
    page_size: int
    pages: int


class StatusCounts(SQLModel):
    model_config = RESPONSE_MODEL  # type: ignore[assignment]

    active: int = 0
    inactive: int = 0
    critical: int = 0


class PatientStats(SQLModel):
    total: int
    by_status: StatusCounts
    seen_last_30_days: int


class ErrorMessage(SQLModel):
    """Body of 4xx/5xx responses raised by the API (FastAPI's HTTPException shape)."""

    detail: str
