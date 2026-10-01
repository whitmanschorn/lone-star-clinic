"""Seed the database with sample patients.

The seed is deliberately boring: a hand-written list plus a loop. There is no
randomness, so every fresh database gets exactly the same patients.
"""

import logging
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlmodel import Session, func, select

from app import seed_data
from app.config import get_settings
from app.models import Note, Patient, PatientCreate

logger = logging.getLogger(__name__)

# Generated on top of the hand-written list so the patient list has enough
# rows to exercise pagination, sorting and search.
GENERATED_PATIENT_COUNT = 100


def generated_patient(i: int) -> dict[str, Any]:
    """Build the i-th generated patient using plain index arithmetic."""
    first_name = seed_data.FIRST_NAMES[i % 10]
    last_name = seed_data.LAST_NAMES[i // 10]
    city, postal_code = seed_data.TOWNS[i % len(seed_data.TOWNS)]

    if i % 17 == 0:
        status = "critical"
    elif i % 5 == 0:
        status = "inactive"
    else:
        status = "active"

    return {
        "first_name": first_name,
        "last_name": last_name,
        "date_of_birth": date(1940 + (i * 7) % 70, 1 + i % 12, 1 + (i * 3) % 28).isoformat(),
        "phone": f"512-555-01{i:02d}",
        "address_line": f"{100 + i * 13} Ranch Road {1 + i % 9}",
        "city": city,
        "postal_code": postal_code,
        "blood_type": seed_data.BLOOD_TYPES[i % len(seed_data.BLOOD_TYPES)],
        "status": status,
        # Roughly two in three have a condition, with the medication that goes
        # with it; one in four has an allergy.
        "conditions": [] if i % 3 == 0 else [seed_data.CONDITIONS[i % len(seed_data.CONDITIONS)]],
        "medications": [] if i % 3 == 0 else [seed_data.MEDICATIONS[i % len(seed_data.CONDITIONS)]],
        "allergies": [seed_data.ALLERGIES[i % len(seed_data.ALLERGIES)]] if i % 4 == 0 else [],
        "last_visit_days_ago": 5 + (i * 11) % 500,
    }


def build_patient(data: dict[str, Any], today: date) -> Patient:
    """Turn one seed entry into a Patient, filling in the derived fields."""
    fields = dict(data)
    fields.pop("notes", None)
    days_ago = fields.pop("last_visit_days_ago", None)
    fields.setdefault("state", "TX")
    fields.setdefault("email", f"{fields['first_name']}.{fields['last_name']}@example.com".lower())
    if days_ago is not None:
        fields["last_visit"] = today - timedelta(days=days_ago)
    # Go through PatientCreate so seed data obeys the same validation as the API.
    return Patient.model_validate(PatientCreate(**fields))


def build_notes(data: dict[str, Any], patient: Patient, today: date) -> list[Note]:
    """Turn one seed entry's (days_ago, text) pairs into Notes for that patient."""
    clinic_time = ZoneInfo(get_settings().clinic_timezone)
    return [
        Note(
            patient_id=patient.id,
            content=content,
            # Mid-morning, clinic time, on the day of the visit.
            timestamp=datetime.combine(today - timedelta(days=days_ago), time(10, 30), clinic_time),
        )
        for days_ago, content in data.get("notes", [])
    ]


def seed(session: Session) -> int:
    """Insert the sample patients and notes if there are no patients. Returns patients added."""
    if session.exec(select(func.count()).select_from(Patient)).one() > 0:
        logger.info("Patients already present, skipping seed")
        return 0

    today = date.today()
    entries = seed_data.PATIENTS + [generated_patient(i) for i in range(GENERATED_PATIENT_COUNT)]
    patients = [build_patient(entry, today) for entry in entries]
    session.add_all(patients)
    # Patients must exist before the notes that point at them.
    session.flush()

    notes = [
        note
        for entry, patient in zip(entries, patients, strict=True)
        for note in build_notes(entry, patient, today)
    ]
    session.add_all(notes)
    session.commit()
    logger.info("Seeded %d patients and %d notes", len(patients), len(notes))
    return len(patients)
