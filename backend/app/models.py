import uuid
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import (
    EmailStr,
    StringConstraints,
    computed_field,
    field_validator,
    model_validator,
)
from sqlalchemy import ARRAY, Column, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
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
    medications: list[str] = Field(
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

    @field_validator("allergies", "conditions", "medications")
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


class NotePreview(SQLModel):
    """Just enough of a note to show in a list."""

    model_config = RESPONSE_MODEL  # type: ignore[assignment]

    id: uuid.UUID
    timestamp: datetime
    excerpt: str


class PatientPublic(PatientBase):
    model_config = RESPONSE_MODEL  # type: ignore[assignment]

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # The patient's most recent note, if they have any.
    last_note: NotePreview | None = None

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


class ChartField(StrEnum):
    """The lists on a patient's chart that a note can change."""

    CONDITIONS = "conditions"
    MEDICATIONS = "medications"
    ALLERGIES = "allergies"


class ChartAction(StrEnum):
    ADD = "add"
    UPDATE = "update"
    REMOVE = "remove"


ChartEntry = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ChartChange(SQLModel):
    """One change to a patient's chart, made together with a note.

    `value` is the entry being added or removed, or the existing entry being
    updated; `new_value` is what an updated entry becomes.
    """

    field: ChartField
    action: ChartAction
    value: ChartEntry
    new_value: ChartEntry | None = None

    @model_validator(mode="after")
    def new_value_fits_action(self) -> Self:
        if self.action is ChartAction.UPDATE:
            if self.new_value is None:
                raise ValueError("new_value is required when action is 'update'")
            if self.new_value == self.value:
                raise ValueError("new_value must differ from value")
        elif self.new_value is not None:
            raise ValueError("new_value is only allowed when action is 'update'")
        return self


# Tolerance for a client clock that runs slightly ahead of the server's.
NOTE_CLOCK_SKEW = timedelta(minutes=5)


class NoteBase(SQLModel):
    content: str = Field(min_length=1, max_length=5000, sa_type=Text)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class Note(NoteBase, table=True):
    __tablename__ = "notes"
    # Serves both "this patient's notes, newest first" and "each patient's latest note".
    __table_args__ = (Index("ix_notes_patient_timestamp", "patient_id", "timestamp"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # Notes belong to one patient and are deleted with them (ON DELETE CASCADE).
    patient_id: uuid.UUID = Field(foreign_key="patients.id", ondelete="CASCADE")
    # When the note was written, as reported by the client.
    timestamp: datetime = Field(sa_type=DateTime(timezone=True))
    # When the server stored it.
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    # The chart changes made with this note (ChartChange dicts), kept as a
    # record of what the note changed.
    changes: list[dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default="[]"),
    )


class NoteCreate(NoteBase):
    timestamp: datetime | None = Field(
        default=None,
        description=(
            "When the note was written (ISO 8601). Defaults to now. "
            "A value without a UTC offset is taken to be UTC."
        ),
    )
    changes: list[ChartChange] = Field(
        default_factory=list,
        max_length=20,
        description=(
            "Chart changes to make together with the note: add, update or remove "
            "a condition, medication or allergy. Applied in order, all or nothing."
        ),
    )

    @field_validator("timestamp")
    @classmethod
    def timestamp_is_aware_and_not_future(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        if value > utcnow() + NOTE_CLOCK_SKEW:
            raise ValueError("timestamp cannot be in the future")
        return value


class NotePublic(NoteBase):
    model_config = RESPONSE_MODEL  # type: ignore[assignment]

    id: uuid.UUID
    patient_id: uuid.UUID
    timestamp: datetime
    created_at: datetime
    changes: list[ChartChange]


class PatientSummary(SQLModel):
    """A readable synthesis of a patient's profile and notes."""

    model_config = RESPONSE_MODEL  # type: ignore[assignment]

    patient_id: uuid.UUID
    name: str
    age: int
    blood_type: BloodType | None
    status: PatientStatus
    conditions: list[str]
    medications: list[str]
    allergies: list[str]
    note_count: int
    narrative: str = Field(description="The story told by the notes, oldest to newest.")
    summary: str = Field(description="The whole summary as plain text, ready to display.")
    generator: Literal["template"] = "template"
    generated_at: datetime


class ErrorMessage(SQLModel):
    """Body of 4xx/5xx responses raised by the API (FastAPI's HTTPException shape)."""

    detail: str
