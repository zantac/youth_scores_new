"""Add tla3bny sponsor ads + per-competition ad controls.

New ``tla3bny_ads`` table (competition_id NULL = home-screen ad owned by the
super admin). Two super-admin controls on the competition: ``max_ads`` (paid
allowance) and ``ads_enabled`` (instant kill switch).

Revision ID: r4s5t6u7v8w9
Revises: q3r4s5t6u7v8
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa

revision = 'r4s5t6u7v8w9'
down_revision = 'q3r4s5t6u7v8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tla3bny_competitions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('max_ads', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('ads_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))

    op.create_table(
        'tla3bny_ads',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('competition_id', sa.Integer(), nullable=True),
        sa.Column('sponsor_name', sa.String(length=255), nullable=True),
        sa.Column('caption', sa.String(length=512), nullable=True),
        sa.Column('poster_path', sa.String(length=512), nullable=False),
        sa.Column('whatsapp_number', sa.String(length=50), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('facebook_url', sa.String(length=512), nullable=True),
        sa.Column('instagram_url', sa.String(length=512), nullable=True),
        sa.Column('website_url', sa.String(length=512), nullable=True),
        sa.Column('location_url', sa.String(length=512), nullable=True),
        sa.Column('expires_at', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ['competition_id'], ['tla3bny_competitions.id'],
            ondelete='CASCADE', name=op.f('fk_tla3bny_ads_competition_id_tla3bny_competitions'),
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_tla3bny_ads')),
    )
    with op.batch_alter_table('tla3bny_ads', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tla3bny_ads_competition_id'), ['competition_id'], unique=False)


def downgrade():
    with op.batch_alter_table('tla3bny_ads', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tla3bny_ads_competition_id'))
    op.drop_table('tla3bny_ads')
    with op.batch_alter_table('tla3bny_competitions', schema=None) as batch_op:
        batch_op.drop_column('ads_enabled')
        batch_op.drop_column('max_ads')
