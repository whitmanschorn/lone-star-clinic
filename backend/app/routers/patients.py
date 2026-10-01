import math
import uuid
from datetime import date, timedelta
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, case, or_
from sqlmodel import col, func, select

from app.db import SessionDep
from app.models import (
    ErrorMessage,
    Patient,
    PatientCreate,
    PatientPublic,
    PatientsPage,
    PatientStats,
    PatientStatus,
    StatusCounts,
    utcnow,
)

router = APIRouter(prefix="/patients", tags=["patients"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorMessage}}


class PatientSort(StrEnum):
    NAME = "name"
    AGE = "age"
    LAST_VISIT = "last_visit"
    STATUS = "status"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


def get_patient_or_404(patient_id: uuid.UUID, session: SessionDep) -> Patient:
    patient = session.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    return patient


PatientDep = Annotated[Patient, Depends(get_patient_or_404)]


def search_filter(q: str) -> ColumnElement[bool]:
    """Case-insensitive substring match on the full name or the email."""
    # Escape LIKE wildcards so a search for "%" or "_" is taken literally.
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    full_name = col(Patient.first_name) + " " + col(Patient.last_name)
    return or_(
        full_name.ilike(pattern, escape="\\"),
        col(Patient.email).ilike(pattern, escape="\\"),
    )


def sort_columns(sort: PatientSort, order: SortOrder) -> list[ColumnElement]:
    descending = order is SortOrder.DESC

    def directed(column: ColumnElement) -> ColumnElement:
        return column.desc() if descending else column.asc()

    name = [directed(col(Patient.last_name)), directed(col(Patient.first_name))]
    match sort:
        case PatientSort.NAME:
            primary = []
        case PatientSort.AGE:
            # Older means an earlier date of birth, so the direction flips.
            dob = col(Patient.date_of_birth)
            primary = [dob.asc() if descending else dob.desc()]
        case PatientSort.LAST_VISIT:
            # Patients who have never visited go last in either direction.
            primary = [directed(col(Patient.last_visit)).nulls_last()]
        case PatientSort.STATUS:
            # Order by urgency, not alphabetically.
            urgency = case(
                (col(Patient.status) == PatientStatus.CRITICAL, 0),
                (col(Patient.status) == PatientStatus.ACTIVE, 1),
                else_=2,
            )
            primary = [directed(urgency)]
    # Name, then id, keeps the order stable so paging never repeats or skips a row.
    return [*primary, *name, col(Patient.id).asc()]


@router.get("")
def list_patients(
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=100, description="Search name or email")] = None,
    status: Annotated[PatientStatus | None, Query(description="Only this status")] = None,
    sort: PatientSort = PatientSort.NAME,
    order: SortOrder = SortOrder.ASC,
) -> PatientsPage:
    filters: list[ColumnElement[bool]] = []
    if q and q.strip():
        filters.append(search_filter(q.strip()))
    if status is not None:
        filters.append(col(Patient.status) == status)

    total = session.exec(select(func.count()).select_from(Patient).where(*filters)).one()
    patients = session.exec(
        select(Patient)
        .where(*filters)
        .order_by(*sort_columns(sort, order))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return PatientsPage(
        items=[PatientPublic.model_validate(patient) for patient in patients],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size),
    )


# Declared before /{patient_id} so "stats" is not parsed as a patient id.
@router.get("/stats")
def patient_stats(session: SessionDep) -> PatientStats:
    rows = session.exec(select(Patient.status, func.count()).group_by(col(Patient.status))).all()
    by_status = StatusCounts(**{str(status): count for status, count in rows})
    recent_cutoff = date.today() - timedelta(days=30)
    seen_recently = session.exec(
        select(func.count()).select_from(Patient).where(col(Patient.last_visit) >= recent_cutoff)
    ).one()
    return PatientStats(
        total=sum(count for _, count in rows),
        by_status=by_status,
        seen_last_30_days=seen_recently,
    )


@router.get("/{patient_id}", response_model=PatientPublic, responses=NOT_FOUND)
def get_patient(patient: PatientDep) -> Patient:
    return patient


@router.post("", response_model=PatientPublic, status_code=status.HTTP_201_CREATED)
def create_patient(body: PatientCreate, session: SessionDep, response: Response) -> Patient:
    patient = Patient.model_validate(body)
    session.add(patient)
    session.commit()
    session.refresh(patient)
    response.headers["Location"] = f"/patients/{patient.id}"
    return patient


@router.put("/{patient_id}", response_model=PatientPublic, responses=NOT_FOUND)
def update_patient(patient: PatientDep, body: PatientCreate, session: SessionDep) -> Patient:
    """Replace the whole record: fields left out of the body go back to their defaults."""
    patient.sqlmodel_update(body.model_dump())
    patient.updated_at = utcnow()
    session.add(patient)
    session.commit()
    session.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_patient(patient: PatientDep, session: SessionDep) -> None:
    session.delete(patient)
    session.commit()
