"""add patient medications

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-01 12:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("medications", sa.ARRAY(sa.String()), server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("patients", "medications")
