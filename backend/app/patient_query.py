"""The query string of GET /patients: paging, sorting, search and filters."""

from datetime import date
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import ColumnElement, or_
from sqlmodel import col, func

from app.models import BloodType, Patient, PatientStatus

OLDEST_AGE = 130


class PatientSort(StrEnum):
    NAME = "name"
    AGE = "age"
    LAST_VISIT = "last_visit"
    LAST_NOTE = "last_note"
    STATUS = "status"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class PatientListQuery(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    sort: PatientSort = PatientSort.NAME
    order: SortOrder = SortOrder.ASC

    q: str | None = Field(None, max_length=100, description="Search name or email")
    status: PatientStatus | None = Field(None, description="Only this status")
    blood_type: list[BloodType] = Field(
        default_factory=list, description="Any of these blood types (repeat the parameter)"
    )
    min_age: int | None = Field(None, ge=0, le=OLDEST_AGE)
    max_age: int | None = Field(None, ge=0, le=OLDEST_AGE)
    last_visit_from: date | None = Field(None, description="Last visit on or after this date")
    last_visit_to: date | None = Field(None, description="Last visit on or before this date")
    condition: str | None = Field(None, max_length=100, description="Has a condition containing")
    medication: str | None = Field(
        None, max_length=100, description="Takes a medication containing"
    )
    allergy: str | None = Field(None, max_length=100, description="Has an allergy containing")
    city: str | None = Field(None, max_length=100, description="City contains")

    @model_validator(mode="after")
    def ranges_are_the_right_way_round(self) -> Self:
        if self.min_age is not None and self.max_age is not None and self.min_age > self.max_age:
            raise ValueError("min_age cannot be greater than max_age")
        if (
            self.last_visit_from is not None
            and self.last_visit_to is not None
            and self.last_visit_from > self.last_visit_to
        ):
            raise ValueError("last_visit_from cannot be after last_visit_to")
        return self


def contains(column: ColumnElement[str], text: str) -> ColumnElement[bool]:
    """Case-insensitive "column contains text", with LIKE wildcards taken literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{escaped}%", escape="\\")


def any_entry_contains(array_column: ColumnElement, text: str) -> ColumnElement[bool]:
    """True if any entry of a text[] column contains `text`."""
    return contains(func.array_to_string(array_column, "\n"), text)


def years_before(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year - years)
    except ValueError:  # 29 February in a year that has none
        return day.replace(year=day.year - years, day=28)


def filter_clauses(query: PatientListQuery, today: date) -> list[ColumnElement[bool]]:
    """The WHERE conditions for a list request. All of them must hold."""
    clauses: list[ColumnElement[bool]] = []

    def given(text: str | None) -> str | None:
        return text.strip() or None if text else None

    if q := given(query.q):
        full_name = col(Patient.first_name) + " " + col(Patient.last_name)
        clauses.append(or_(contains(full_name, q), contains(col(Patient.email), q)))
    if query.status is not None:
        clauses.append(col(Patient.status) == query.status)
    if query.blood_type:
        clauses.append(col(Patient.blood_type).in_(query.blood_type))

    # Age is not stored; it follows from the date of birth. Someone is at least
    # N years old if born on or before today's date N years ago, and at most N
    # if born after today's date N + 1 years ago.
    if query.min_age is not None:
        clauses.append(col(Patient.date_of_birth) <= years_before(today, query.min_age))
    if query.max_age is not None:
        clauses.append(col(Patient.date_of_birth) > years_before(today, query.max_age + 1))

    if query.last_visit_from is not None:
        clauses.append(col(Patient.last_visit) >= query.last_visit_from)
    if query.last_visit_to is not None:
        clauses.append(col(Patient.last_visit) <= query.last_visit_to)

    if condition := given(query.condition):
        clauses.append(any_entry_contains(col(Patient.conditions), condition))
    if medication := given(query.medication):
        clauses.append(any_entry_contains(col(Patient.medications), medication))
    if allergy := given(query.allergy):
        clauses.append(any_entry_contains(col(Patient.allergies), allergy))
    if city := given(query.city):
        clauses.append(contains(col(Patient.city), city))

    return clauses
