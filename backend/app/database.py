from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# backend/app/database.py → ../ = backend/
# Absolute path kullan: backend/network_monitor.db
_BACKEND_DIR = Path(__file__).parent.parent
_DB_PATH = str(_BACKEND_DIR.absolute() / 'network_monitor.db')
_DEFAULT_DB  = f"sqlite:///{_DB_PATH}"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DB)

# SQLite için check_same_thread=False gereklidir
# Pool: default 5 → 20, overflow 10 → 30 (connection timeout önlemek için)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,
    pool_recycle=3600
)
# SQLite PRAGMA: WAL modu (concurrent reader/writer), foreign keys, busy timeout.
# WAL: okuma yazmayı bloklamaz → quick scan + dashboard sorgusu paralel çalışır.
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
