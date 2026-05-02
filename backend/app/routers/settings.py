from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import asyncio
import json
import socket
from pathlib import Path
from ..database import get_db
from .. import models, schemas
from ..services.scheduler import network_scheduler

# tray_config.json: backend/app/routers/ → ../../.. = proje kökü
_TRAY_CONFIG = Path(__file__).parents[3] / "tray_config.json"

def _read_tray_cfg() -> dict:
    try:
        return json.loads(_TRAY_CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {"port": 8000, "dark": True}

def _write_tray_cfg(cfg: dict):
    _TRAY_CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

router = APIRouter(
    prefix="/settings",
    tags=["settings"]
)

@router.get("/", response_model=List[schemas.SettingOut])
def get_settings(db: Session = Depends(get_db)):
    """
    Sistem ayarlarını listele.
    """
    return db.query(models.Setting).all()

@router.get("/{key}", response_model=schemas.SettingOut)
def get_setting(key: str, db: Session = Depends(get_db)):
    """
    Belirli bir ayarı anahtarına göre getir.
    """
    setting = db.query(models.Setting).filter(models.Setting.key == key).first()
    if not setting:
        # Eğer ayar yoksa varsayılan değerler oluşturulabilir veya 404 dönülür
        raise HTTPException(status_code=404, detail="Setting not found")
    return setting

@router.put("/{key}", response_model=schemas.SettingOut)
async def update_setting(key: str, setting_update: schemas.SettingUpdate, db: Session = Depends(get_db)):
    """
    Ayar değerini güncelle. async def: asyncio.create_task event loop'ta çalışır.
    """
    db_setting = db.query(models.Setting).filter(models.Setting.key == key).first()

    if not db_setting:
        db_setting = models.Setting(key=key, value=setting_update.value)
        db.add(db_setting)
    else:
        db_setting.value = setting_update.value

    db.commit()
    db.refresh(db_setting)

    if key == "ping_interval":
        try:
            network_scheduler.update_interval(int(db_setting.value))
        except ValueError:
            pass

    if key == "log_cleanup_days":
        asyncio.create_task(network_scheduler.cleanup_old_logs())

    if key == "debug_mode":
        from ..main import setup_logging
        try:
            setup_logging(debug=db_setting.value.lower() == "true")
        except (ValueError, AttributeError):
            pass

    from ..ws import manager
    asyncio.create_task(manager.broadcast({
        "type": "settings_updated",
        "key": key,
        "value": db_setting.value
    }))

    return db_setting


# ── tray_config.json okuma / yazma ──────────────────────────────────────────

@router.get("/config/connection")
def get_connection():
    """tray_config.json'dan port ve sunucu IP bilgisini döner."""
    cfg = _read_tray_cfg()
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None):
            ip = info[4][0]
            if ":" not in ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return {
        "port": cfg.get("port", 8000),
        "host": ips[0] if ips else "127.0.0.1",
        "all_ips": ips or ["127.0.0.1"],
    }

@router.put("/config/connection")
def update_connection(body: dict):
    """tray_config.json'daki port'u günceller."""
    port = int(body.get("port", 8000))
    if not (1024 <= port <= 65535):
        raise HTTPException(status_code=400, detail="Port 1024-65535 arasında olmalı")
    cfg = _read_tray_cfg()
    cfg["port"] = port
    _write_tray_cfg(cfg)
    return {"port": port}
