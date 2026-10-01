"""Seed the database with sample patients.

The seed is deliberately boring: a hand-written list plus a loop. There is no
randomness, so every fresh database gets exactly the same patients.
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlmodel import Session, func, select

from app import seed_data
from app.models import Patient, PatientCreate

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
        # Roughly two in three have a condition; one in four has an allergy.
        "conditions": [] if i % 3 == 0 else [seed_data.CONDITIONS[i % len(seed_data.CONDITIONS)]],
        "allergies": [seed_data.ALLERGIES[i % len(seed_data.ALLERGIES)]] if i % 4 == 0 else [],
        "last_visit_days_ago": 5 + (i * 11) % 500,
    }


def build_patient(data: dict[str, Any], today: date) -> Patient:
    """Turn one seed entry into a Patient, filling in the derived fields."""
    fields = dict(data)
    days_ago = fields.pop("last_visit_days_ago", None)
    fields.setdefault("state", "TX")
    fields.setdefault("email", f"{fields['first_name']}.{fields['last_name']}@example.com".lower())
    if days_ago is not None:
        fields["last_visit"] = today - timedelta(days=days_ago)
    # Go through PatientCreate so seed data obeys the same validation as the API.
    return Patient.model_validate(PatientCreate(**fields))


def seed(session: Session) -> int:
    """Insert the sample patients if the table is empty. Returns rows added."""
    if session.exec(select(func.count()).select_from(Patient)).one() > 0:
        logger.info("Patients already present, skipping seed")
        return 0

    today = date.today()
    entries = seed_data.PATIENTS + [generated_patient(i) for i in range(GENERATED_PATIENT_COUNT)]
    session.add_all(build_patient(entry, today) for entry in entries)
    session.commit()
    logger.info("Seeded %d patients", len(entries))
    return len(entries)
