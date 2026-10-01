"""create patients

Revision ID: 0001
Revises:
Create Date: 2026-10-01 09:50:59.154228

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "patients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("address_line", sa.String(length=200), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=2), nullable=True),
        sa.Column("postal_code", sa.String(length=10), nullable=True),
        sa.Column("blood_type", sa.String(length=3), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("allergies", sa.ARRAY(sa.String()), server_default="{}", nullable=False),
        sa.Column("conditions", sa.ARRAY(sa.String()), server_default="{}", nullable=False),
        sa.Column("last_visit", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_patients_name", "patients", ["last_name", "first_name"])
    op.create_index(op.f("ix_patients_status"), "patients", ["status"])
    op.create_index(op.f("ix_patients_last_visit"), "patients", ["last_visit"])


def downgrade() -> None:
    op.drop_index(op.f("ix_patients_last_visit"), table_name="patients")
    op.drop_index(op.f("ix_patients_status"), table_name="patients")
    op.drop_index("ix_patients_name", table_name="patients")
    op.drop_table("patients")
