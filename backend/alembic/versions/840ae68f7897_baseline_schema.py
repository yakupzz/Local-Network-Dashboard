"""baseline schema

Bu revision mevcut veritabanı durumunu (devices, ping_logs, categories, settings,
image_filename kolonu, idx_ping_logs_device_ts index'i) temsil eder. Yeni kurulumlar
için tabloları oluşturur, mevcut kurulumlar `alembic stamp head` ile bu revision'a
işaretlenmiştir.

Revision ID: 840ae68f7897
Revises:
Create Date: 2026-05-02 08:21:09.628146

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '840ae68f7897'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Mevcut DB'de tabloları oluşturma — Base.metadata.create_all() startup'ta
    çalıştığı için boş bırakıyoruz. Yeni migration'lar bu revision'ın üstüne yazılır."""
    pass


def downgrade() -> None:
    """Baseline'ın altına bir şey yok."""
    pass
