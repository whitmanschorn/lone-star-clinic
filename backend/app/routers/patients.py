import math
import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, case, true
from sqlalchemy.orm import aliased
from sqlmodel import Session, col, func, select

from app.db import SessionDep
from app.models import (
    AgeBandCount,
    ConditionCount,
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
from app.patient_query import (
    PatientListQuery,
    PatientSort,
    SortOrder,
    filter_clauses,
    years_before,
)
from app.text import shorten

router = APIRouter(prefix="/patients", tags=["patients"])

NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorMessage}}


# Longest note excerpt sent with a patient.
NOTE_PREVIEW_CHARS = 120


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


def sort_columns(sort: PatientSort, order: SortOrder) -> list[ColumnElement]:
    descending = order is SortOrder.DESC

    def directed(column: ColumnElement) -> ColumnElement:
        return column.desc() if descending else column.asc()

    by_name = [col(Patient.last_name).asc(), col(Patient.first_name).asc()]
    match sort:
        case PatientSort.NAME:
            primary = [directed(col(Patient.last_name)), directed(col(Patient.first_name))]
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
    # Ties are broken by name, always A to Z, then by id, which keeps the order
    # stable so paging never repeats or skips a row.
    return [*primary, *by_name, col(Patient.id).asc()]


@router.get("")
def list_patients(session: SessionDep, query: Annotated[PatientListQuery, Query()]) -> PatientsPage:
    """One page of patients. Filters combine with AND; see PatientListQuery."""
    filters = filter_clauses(query, date.today())

    total = session.exec(select(func.count()).select_from(Patient).where(*filters)).one()
    rows = session.exec(
        select(Patient, LatestNote)
        .outerjoin(LatestNote, col(LatestNote.patient_id) == col(Patient.id))
        .where(*filters)
        .order_by(*sort_columns(query.sort, query.order))
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    ).all()

    return PatientsPage(
        items=[to_public(patient, last_note) for patient, last_note in rows],
        total=total,
        page=query.page,
        page_size=query.page_size,
        pages=math.ceil(total / query.page_size),
    )


# Age bands for the dashboard chart: (label, youngest age, oldest age or None).
AGE_BANDS: list[tuple[str, int, int | None]] = [
    ("0–17", 0, 17),
    ("18–39", 18, 39),
    ("40–64", 40, 64),
    ("65–79", 65, 79),
    ("80+", 80, None),
]
TOP_CONDITIONS = 6


def count_by_age_band(session: Session, today: date) -> list[AgeBandCount]:
    # A band is a range of birth dates, the same arithmetic the age filters
    # use, so a chart column and the list it links to always agree.
    born = col(Patient.date_of_birth)
    band = case(
        *[
            (born > years_before(today, max_age + 1), index)
            for index, (_, _, max_age) in enumerate(AGE_BANDS)
            if max_age is not None
        ],
        else_=len(AGE_BANDS) - 1,
    )
    counts = dict(session.exec(select(band, func.count()).group_by(band)).all())
    return [
        AgeBandCount(label=label, min_age=min_age, max_age=max_age, count=counts.get(index, 0))
        for index, (label, min_age, max_age) in enumerate(AGE_BANDS)
    ]


def most_common_conditions(session: Session, limit: int) -> list[ConditionCount]:
    # One row per (patient, condition), then counted. Grouping ignores case so
    # "asthma" and "Asthma" are one condition.
    entries = func.unnest(col(Patient.conditions)).table_valued("condition").render_derived()
    condition = entries.c.condition
    rows = session.exec(
        select(func.min(condition), func.count())
        .select_from(Patient)
        .join(entries, true())
        .group_by(func.lower(condition))
        .order_by(func.count().desc(), func.lower(condition))
        .limit(limit)
    ).all()
    return [ConditionCount(name=name, count=count) for name, count in rows]


# Declared before /{patient_id} so "stats" is not parsed as a patient id.
@router.get("/stats")
def patient_stats(session: SessionDep) -> PatientStats:
    """Aggregates for the dashboard."""
    today = date.today()
    rows = session.exec(select(Patient.status, func.count()).group_by(col(Patient.status))).all()
    by_status = StatusCounts(**{str(status): count for status, count in rows})
    seen_recently = session.exec(
        select(func.count())
        .select_from(Patient)
        .where(col(Patient.last_visit) >= today - timedelta(days=30))
    ).one()
    return PatientStats(
        total=sum(count for _, count in rows),
        by_status=by_status,
        seen_last_30_days=seen_recently,
        by_age_band=count_by_age_band(session, today),
        top_conditions=most_common_conditions(session, TOP_CONDITIONS),
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
