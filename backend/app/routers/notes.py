import uuid
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlmodel import col, select

from app.chart import ChartConflict, apply_changes
from app.config import get_settings
from app.db import SessionDep
from app.models import ErrorMessage, Note, NoteCreate, NotePublic, PatientSummary, utcnow
from app.narrative import GeneratorChoice, available_generators, narrate
from app.routers.patients import NOT_FOUND, PatientDep
from app.summary import build_summary

# Everything here hangs off one patient; PatientDep answers 404 if they do not exist.
router = APIRouter(prefix="/patients/{patient_id}", tags=["notes"], responses=NOT_FOUND)


@router.get("/notes", response_model=list[NotePublic])
def list_notes(patient: PatientDep, session: SessionDep) -> list[Note]:
    """All of a patient's notes, newest first."""
    notes = session.exec(
        select(Note)
        .where(Note.patient_id == patient.id)
        .order_by(col(Note.timestamp).desc(), col(Note.created_at).desc())
    ).all()
    return list(notes)


@router.post(
    "/notes",
    response_model=NotePublic,
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"model": ErrorMessage}},
)
def create_note(
    patient: PatientDep, body: NoteCreate, session: SessionDep, response: Response
) -> Note:
    """Add a note and, optionally, update the patient's chart in the same step.

    The note and its chart changes are saved together or not at all. A change
    that does not fit the current chart (adding an entry that is already there,
    updating or removing one that is not) is refused with 409.
    """
    try:
        apply_changes(patient, body.changes)
    except ChartConflict as conflict:
        raise HTTPException(status.HTTP_409_CONFLICT, str(conflict)) from conflict

    note = Note(
        patient_id=patient.id,
        content=body.content,
        timestamp=body.timestamp or utcnow(),
        changes=[change.model_dump(mode="json", exclude_none=True) for change in body.changes],
    )
    if body.changes:
        patient.updated_at = utcnow()
        session.add(patient)
    session.add(note)
    session.commit()
    session.refresh(note)
    response.headers["Location"] = f"/patients/{patient.id}/notes/{note.id}"
    return note


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(patient: PatientDep, note_id: uuid.UUID, session: SessionDep) -> None:
    note = session.get(Note, note_id)
    # A note that exists but belongs to someone else is "not found" here too.
    if note is None or note.patient_id != patient.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    session.delete(note)
    session.commit()


@router.get("/summary")
def patient_summary(
    patient: PatientDep,
    session: SessionDep,
    generator: Annotated[
        GeneratorChoice,
        Query(description='Who should write the narrative. "auto" is the server\'s default.'),
    ] = GeneratorChoice.AUTO,
    refresh: Annotated[
        bool, Query(description="Ask the LLM again instead of reusing its earlier answer.")
    ] = False,
) -> PatientSummary:
    """A readable summary of the patient's profile and notes.

    The narrative is written by an LLM when one is configured, and by a
    built-in template otherwise or whenever the LLM cannot answer; the
    response says which, and why if it fell back.
    """
    settings = get_settings()
    notes = session.exec(select(Note).where(Note.patient_id == patient.id)).all()
    timezone = ZoneInfo(settings.clinic_timezone)
    narrative = narrate(patient, notes, timezone, settings, generator, refresh)
    return build_summary(
        patient,
        notes,
        timezone,
        narrative=narrative.text,
        generator=narrative.generator,
        model=narrative.model,
        fallback_reason=narrative.fallback_reason,
        available_generators=available_generators(settings),
    )
