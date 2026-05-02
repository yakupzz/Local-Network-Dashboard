import platform
import asyncio

# CRITICAL: Windows ProactorEventLoop configuration must be at the very top
if platform.system() == "Windows":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception as e:
        print(f"Warning: Could not set WindowsProactorEventLoopPolicy: {e}")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import engine, Base, SessionLocal
from .models import Setting
from .routers import devices, ping, settings, dashboard, categories
from .services.scheduler import network_scheduler
from .ws import manager
from .auth import require_api_token
from fastapi import Depends
import logging
import os
from pathlib import Path

# Log yapılandırması
def setup_logging(debug: bool = False):
    """Debug modu aç/kapat — True ise DEBUG seviyesi, False ise WARNING+."""
    level = logging.DEBUG if debug else logging.WARNING
    fmt = "%(asctime)s [%(levelname)-7s] %(name)s: %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    # Console handler (uvicorn stdout → server.log)
    ch = logging.StreamHandler()
    ch.setLevel(level)
    ch.setFormatter(logging.Formatter(fmt, datefmt))
    root.addHandler(ch)

    # uvicorn loggerlarını da sync et
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.setLevel(level)
        uv_logger.propagate = True

logger = logging.getLogger(__name__)

# Schema yönetimi:
# - İlk kurulumda Base.metadata.create_all() tabloları oluşturur (Alembic alternatifi).
# - Mevcut kurulumlar için `alembic upgrade head` schema'yı senkron tutar.
#   AUTO_MIGRATE=1 env var'ı set edilirse startup'ta otomatik upgrade çalışır.
Base.metadata.create_all(bind=engine)

if os.getenv("AUTO_MIGRATE", "").lower() in ("1", "true", "yes"):
    try:
        from alembic.config import Config as _AlembicConfig
        from alembic import command as _alembic_command
        _alembic_cfg = _AlembicConfig(str(Path(__file__).parents[1] / "alembic.ini"))
        _alembic_command.upgrade(_alembic_cfg, "head")
        logging.getLogger(__name__).info("Alembic upgrade head completed")
    except Exception as _mig_err:
        logging.getLogger(__name__).error(f"Alembic auto-migrate failed: {_mig_err}")

app = FastAPI(
    title="Network Monitor Dashboard API",
    description="Ağ cihazlarını izleyen ve durumlarını raporlayan API",
    version="1.0.0"
)

# CORS Ayarları (Frontend bağlantısı için)
# CORS_ORIGINS env vars: virgülle ayrılmış origin listesi.
# Boş bırakılırsa LAN içi development için yaygın localhost portları + private IP regex.
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
if _cors_env:
    _allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    _allow_origin_regex = None
else:
    _allowed_origins = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:8000", "http://127.0.0.1:8000",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ]
    # LAN içi private IP'lere izin ver (dashboard tipik olarak 192.168.x.x veya 10.x.x.x)
    _allow_origin_regex = r"^http://(192\.168|10|172\.(1[6-9]|2[0-9]|3[01]))\.[\d.]+(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (kategoriler için) — mount işlemi router'lardan ÖNCE yapılmalı
static_dir = Path(__file__).parent.parent / "static"
static_dir.mkdir(exist_ok=True)
static_abs_path = os.path.abspath(str(static_dir))
logger.info(f"🖼️  StaticFiles mounting at /static → {static_abs_path}")
app.mount("/static", StaticFiles(directory=static_abs_path), name="static")

# Router'ları kaydet — API_TOKEN env var'ı set edildiğinde tüm /api/* için bearer auth devreye girer.
_auth_dep = [Depends(require_api_token)]
app.include_router(devices.router, prefix="/api", dependencies=_auth_dep)
app.include_router(ping.router, prefix="/api", dependencies=_auth_dep)
app.include_router(settings.router, prefix="/api", dependencies=_auth_dep)
app.include_router(categories.router, prefix="/api", dependencies=_auth_dep)
app.include_router(dashboard.router, prefix="/api", dependencies=_auth_dep)

@app.on_event("startup")
async def startup_event():
    """
    Uygulama başladığında veritabanındaki ayarları kontrol et,
    varsayılan kategorileri ekle ve scheduler'ı başlat.
    """
    db = SessionLocal()
    try:
        # Varsayılan ping aralığı ayarını kontrol et
        interval_setting = db.query(Setting).filter(Setting.key == "ping_interval").first()
        interval = 300 # varsayılan 5 dakika

        if not interval_setting:
            interval_setting = Setting(key="ping_interval", value="300")
            db.add(interval_setting)
            db.commit()
        else:
            try:
                interval = int(interval_setting.value)
            except ValueError:
                interval = 300

        # Varsayılan geçmiş saklama süresi ayarını kontrol et
        retention_setting = db.query(Setting).filter(Setting.key == "log_cleanup_days").first()
        if not retention_setting:
            retention_setting = Setting(key="log_cleanup_days", value="30")
            db.add(retention_setting)
            db.commit()

        # Varsayılan TCP tarama portları
        ports_setting = db.query(Setting).filter(Setting.key == "tcp_scan_ports").first()
        if not ports_setting:
            ports_setting = Setting(key="tcp_scan_ports", value="80,443,22,3389,445,135,8080,8443")
            db.add(ports_setting)
            db.commit()

        # Varsayılan hızlı tarama aralığı (quick_scan_interval)
        quick_setting = db.query(Setting).filter(Setting.key == "quick_scan_interval").first()
        quick_interval = 60  # varsayılan 60 saniye
        if not quick_setting:
            quick_setting = Setting(key="quick_scan_interval", value="60")
            db.add(quick_setting)
            db.commit()
        else:
            try:
                quick_interval = int(quick_setting.value)
            except ValueError:
                quick_interval = 60

        # Varsayılan debug modu ayarı
        debug_setting = db.query(Setting).filter(Setting.key == "debug_mode").first()
        debug_mode = False  # varsayılan OFF
        if not debug_setting:
            debug_setting = Setting(key="debug_mode", value="false")
            db.add(debug_setting)
            db.commit()
        else:
            try:
                debug_mode = debug_setting.value.lower() == "true"
            except (ValueError, AttributeError):
                debug_mode = False

        # Logging seviyesini ayarla
        setup_logging(debug=debug_mode)

        # Varsayılan kategorileri ekle (ilk çalıştırmada)
        from .models import Category
        existing_categories = db.query(Category).count()
        if existing_categories == 0:
            default_categories = [
                Category(id="pc", name="Bilgisayar", icon="💻", image_filename="computer.png"),
                Category(id="phone", name="Telefon", icon="📱", image_filename="phone.png"),
                Category(id="tv", name="Akıllı TV", icon="📺", image_filename="smart-tv.png"),
                Category(id="camera", name="Kamera", icon="📷", image_filename="security-camera.png"),
                Category(id="nvr", name="NVR", icon="🖥️", image_filename="nvr.png"),
                Category(id="other", name="Diğer", icon="❓", image_filename="hero.png"),
            ]
            db.add_all(default_categories)
            db.commit()
            logger.info("Default categories created.")

        # Scheduler'ı başlat
        network_scheduler.start(interval_seconds=interval, quick_check_interval=quick_interval)
        logger.info(f"Application started. Scheduler active with {interval}s (ping) and {quick_interval}s (quick scan) intervals.")

    finally:
        db.close()

@app.on_event("shutdown")
def shutdown_event():
    """
    Uygulama kapandığında scheduler'ı durdur.
    """
    network_scheduler.stop()
    logger.info("Application shutting down. Scheduler stopped.")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # WebSocket read-only event stream; LAN içinde token gerektirmez.
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Frontend SPA catch-all — HTTP GET route, WebSocket scope'larına dokunmaz.
# app.mount("/", StaticFiles(...)) prefix-match yaptığı için /ws WebSocket
# bağlantılarını da yakalar ve AssertionError verir; bu yaklaşım güvenli.
_frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    logger.info(f"📦 Frontend dist found: {_frontend_dist}")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str, request: Request):
        file_path = _frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_frontend_dist / "index.html"))
else:
    logger.warning(f"⚠️  Frontend dist not found at {_frontend_dist} - dev mode (Vite proxy)")
