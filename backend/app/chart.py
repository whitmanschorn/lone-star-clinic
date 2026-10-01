"""Apply a note's chart changes to a patient.

A note can add, update or remove entries in the patient's conditions,
medications and allergies. The changes are checked against the chart as it is
right now, so a stale or mistaken request is refused rather than half-applied.
"""

from collections.abc import Sequence

from app.models import ChartAction, ChartChange, ChartField, Patient

SINGULAR = {
    ChartField.CONDITIONS: "condition",
    ChartField.MEDICATIONS: "medication",
    ChartField.ALLERGIES: "allergy",
}


class ChartConflict(Exception):
    """A change does not fit the chart as it currently stands."""


def _index_of(entries: Sequence[str], value: str) -> int | None:
    """Position of `value` in `entries`, ignoring case, or None."""
    lowered = value.lower()
    return next((i for i, entry in enumerate(entries) if entry.lower() == lowered), None)


def apply_changes(patient: Patient, changes: Sequence[ChartChange]) -> None:
    """Apply `changes` in order. Raises ChartConflict, leaving the patient untouched."""
    # Work on copies so a conflict part-way through changes nothing.
    chart = {field: list(getattr(patient, field)) for field in ChartField}

    for change in changes:
        entries = chart[change.field]
        kind = SINGULAR[change.field].capitalize()
        index = _index_of(entries, change.value)

        match change.action:
            case ChartAction.ADD:
                if index is not None:
                    raise ChartConflict(f'{kind} "{change.value}" is already on the chart.')
                entries.append(change.value)
            case ChartAction.UPDATE:
                assert change.new_value is not None  # guaranteed by ChartChange
                if index is None:
                    raise ChartConflict(f'{kind} "{change.value}" is not on the chart.')
                clash = _index_of(entries, change.new_value)
                if clash is not None and clash != index:
                    raise ChartConflict(f'{kind} "{change.new_value}" is already on the chart.')
                entries[index] = change.new_value
            case ChartAction.REMOVE:
                if index is None:
                    raise ChartConflict(f'{kind} "{change.value}" is not on the chart.')
                del entries[index]

    for field, entries in chart.items():
        # Assign new lists (rather than mutating) so SQLAlchemy sees the change.
        if entries != getattr(patient, field):
            setattr(patient, field, entries)


def describe_change(change: ChartChange) -> str:
    """A change as a phrase, e.g. 'added medication Metoprolol 50 mg'."""
    kind = SINGULAR[change.field]
    match change.action:
        case ChartAction.ADD:
            return f"added {kind} {change.value}"
        case ChartAction.UPDATE:
            return f"changed {kind} {change.value} to {change.new_value}"
        case ChartAction.REMOVE:
            return f"removed {kind} {change.value}"
