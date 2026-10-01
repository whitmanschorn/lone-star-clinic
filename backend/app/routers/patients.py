import math
import uuid
from datetime import date, timedelta
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, case, or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select

from app.db import SessionDep
from app.models import (
    ErrorMessage,
    Note,
    NotePreview,
    Patient,
    PatientCreate,
    PatientPublic,
    PatientsPage,
    PatientStats,
    PatientStatus,
    StatusCounts,
    utcnow,
)
from app.text import shorten

router = APIRouter(prefix="/patients", tags=["patients"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorMessage}}


# Longest note excerpt sent with a patient.
NOTE_PREVIEW_CHARS = 120


class PatientSort(StrEnum):
    NAME = "name"
    AGE = "age"
    LAST_VISIT = "last_visit"
    LAST_NOTE = "last_note"
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

# Each patient's most recent note: DISTINCT ON keeps the first row per patient
# in (timestamp, created_at) descending order.
_latest_notes = (
    select(Note)
    .distinct(col(Note.patient_id))
    .order_by(col(Note.patient_id), col(Note.timestamp).desc(), col(Note.created_at).desc())
    .subquery()
)
LatestNote = aliased(Note, _latest_notes)


def latest_note(session: Session, patient: Patient) -> Note | None:
    return session.exec(
        select(Note)
        .where(Note.patient_id == patient.id)
        .order_by(col(Note.timestamp).desc(), col(Note.created_at).desc())
        .limit(1)
    ).first()


def to_public(patient: Patient, last_note: Note | None) -> PatientPublic:
    preview = (
        NotePreview(
            id=last_note.id,
            timestamp=last_note.timestamp,
            excerpt=shorten(last_note.content, NOTE_PREVIEW_CHARS),
        )
        if last_note
        else None
    )
    return PatientPublic.model_validate(patient, update={"last_note": preview})


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
        case PatientSort.LAST_NOTE:
            # Likewise patients with no notes.
            primary = [directed(col(LatestNote.timestamp)).nulls_last()]
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
    rows = session.exec(
        select(Patient, LatestNote)
        .outerjoin(LatestNote, col(LatestNote.patient_id) == col(Patient.id))
        .where(*filters)
        .order_by(*sort_columns(sort, order))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return PatientsPage(
        items=[to_public(patient, last_note) for patient, last_note in rows],
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


@router.get("/{patient_id}", responses=NOT_FOUND)
def get_patient(patient: PatientDep, session: SessionDep) -> PatientPublic:
    return to_public(patient, latest_note(session, patient))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_patient(body: PatientCreate, session: SessionDep, response: Response) -> PatientPublic:
    patient = Patient.model_validate(body)
    session.add(patient)
    session.commit()
    session.refresh(patient)
    response.headers["Location"] = f"/patients/{patient.id}"
    return to_public(patient, None)


@router.put("/{patient_id}", responses=NOT_FOUND)
def update_patient(patient: PatientDep, body: PatientCreate, session: SessionDep) -> PatientPublic:
    """Replace the whole record: fields left out of the body go back to their defaults."""
    patient.sqlmodel_update(body.model_dump())
    patient.updated_at = utcnow()
    session.add(patient)
    session.commit()
    session.refresh(patient)
    return to_public(patient, latest_note(session, patient))


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_patient(patient: PatientDep, session: SessionDep) -> None:
    session.delete(patient)
    session.commit()
