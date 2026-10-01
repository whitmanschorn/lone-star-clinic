"""index notes by patient and time

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-01 13:20:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The composite index also covers lookups by patient alone.
    op.create_index("ix_notes_patient_timestamp", "notes", ["patient_id", "timestamp"])
    op.drop_index(op.f("ix_notes_patient_id"), table_name="notes")


def downgrade() -> None:
    op.create_index(op.f("ix_notes_patient_id"), "notes", ["patient_id"])
    op.drop_index("ix_notes_patient_timestamp", table_name="notes")
