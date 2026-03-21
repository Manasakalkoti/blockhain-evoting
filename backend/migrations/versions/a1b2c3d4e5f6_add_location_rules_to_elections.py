"""add location_rules to elections

Revision ID: a1b2c3d4e5f6
Revises: 5cab6c1da0bc
Create Date: 2026-03-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '5cab6c1da0bc'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('elections', sa.Column('location_rules', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('elections', 'location_rules')
