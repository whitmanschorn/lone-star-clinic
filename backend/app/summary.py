"""Build a human-readable patient summary from the profile and notes.

This is a deterministic, template-based generator: the same patient and notes
always produce the same text, and it needs no network or API key. It is one
pure function, so swapping in an LLM later means writing a second function
with the same signature.
"""

from collections.abc import Sequence
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.chart import describe_change
from app.models import ChartChange, Note, Patient, PatientSummary, age_on, utcnow
from app.text import shorten

# Notes quoted in the narrative besides the first and the latest. Older ones in
# between are counted rather than quoted, so the summary stays readable.
MAX_MIDDLE_NOTES = 3
# Longest excerpt quoted from a single note.
MAX_EXCERPT_CHARS = 280


def long_date(value: date) -> str:
    return f"{value:%B} {value.day}, {value.year}"


def join_list(items: Sequence[str]) -> str:
    """["a", "b", "c"] -> "a, b and c"."""
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def excerpt(content: str) -> str:
    """One note as a single tidy sentence-like fragment."""
    text = shorten(content, MAX_EXCERPT_CHARS)
    if text[-1] not in ".!?…":
        text += "."
    return text


def quote(note: Note) -> str:
    """A note as it appears in the narrative: its text, then any chart changes."""
    text = excerpt(note.content)
    if note.changes:
        changes = [describe_change(ChartChange.model_validate(change)) for change in note.changes]
        text += f" Chart updated: {join_list(changes)}."
    return text


def identifiers_paragraph(patient: Patient, age: int) -> str:
    blood_type = f"blood type {patient.blood_type}" if patient.blood_type else "blood type unknown"
    return (
        f"{patient.first_name} {patient.last_name} is a {age}-year-old patient "
        f"(born {long_date(patient.date_of_birth)}), {blood_type}. "
        f"Current status: {patient.status}."
    )


def clinical_paragraph(patient: Patient) -> str:
    conditions = (
        f"Known conditions: {join_list(patient.conditions)}."
        if patient.conditions
        else "No conditions are on record."
    )
    medications = (
        f"Current medications: {join_list(patient.medications)}."
        if patient.medications
        else "No medications are on record."
    )
    allergies = (
        f"Allergies: {join_list(patient.allergies)}."
        if patient.allergies
        else "No known allergies."
    )
    last_visit = (
        f"Last visit: {long_date(patient.last_visit)}."
        if patient.last_visit
        else "No visits are on record."
    )
    return f"{conditions} {medications} {allergies} {last_visit}"


def narrative_paragraph(patient: Patient, notes: Sequence[Note], timezone: ZoneInfo) -> str:
    """Tell the story of the notes in date order."""
    if not notes:
        return f"No clinical notes have been recorded for {patient.first_name} yet."

    def on(timestamp: datetime) -> str:
        return long_date(timestamp.astimezone(timezone).date())

    ordered = sorted(notes, key=lambda note: note.timestamp)
    first, latest = ordered[0], ordered[-1]

    if len(ordered) == 1:
        return f"There is one clinical note on file, from {on(first.timestamp)}: {quote(first)}"

    middle = ordered[1:-1]
    quoted = middle[-MAX_MIDDLE_NOTES:]
    skipped = len(middle) - len(quoted)

    sentences = [
        f"There are {len(ordered)} clinical notes on file, "
        f"from {on(first.timestamp)} to {on(latest.timestamp)}.",
        f"The record opens on {on(first.timestamp)}: {quote(first)}",
    ]
    if skipped:
        plural = "note is" if skipped == 1 else "notes are"
        sentences.append(f"({skipped} further {plural} not quoted here.)")
    sentences.extend(f"On {on(note.timestamp)}: {quote(note)}" for note in quoted)
    sentences.append(f"Most recently, on {on(latest.timestamp)}: {quote(latest)}")
    return " ".join(sentences)


def build_summary(patient: Patient, notes: Sequence[Note], timezone: ZoneInfo) -> PatientSummary:
    generated_at = utcnow()
    age = age_on(patient.date_of_birth, generated_at.astimezone(timezone).date())
    narrative = narrative_paragraph(patient, notes, timezone)
    paragraphs = [identifiers_paragraph(patient, age), clinical_paragraph(patient), narrative]

    return PatientSummary(
        patient_id=patient.id,
        name=f"{patient.first_name} {patient.last_name}",
        age=age,
        blood_type=patient.blood_type,
        status=patient.status,
        conditions=patient.conditions,
        medications=patient.medications,
        allergies=patient.allergies,
        note_count=len(notes),
        narrative=narrative,
        summary="\n\n".join(paragraphs),
        generated_at=generated_at,
    )
