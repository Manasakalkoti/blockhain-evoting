"""add merkle_tree_json to elections

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-03-22 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b3c4d5e6f7a8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('elections',
        sa.Column('merkle_tree_json', sa.Text(), nullable=True)
    )


def downgrade():
    op.drop_column('elections', 'merkle_tree_json')
