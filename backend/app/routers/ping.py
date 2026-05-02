from fastapi import APIRouter, Depends, HTTPException
import asyncio
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict
from ..database import get_db
from .. import models, schemas
from ..services.ping_service import PingService
from ..services.scheduler import network_scheduler
from ..ws import manager
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)
# Manual ping kullanıcı tetiklemeli; debug_mode kapalı olsa da görünmesi için
# bu logger'a kendi handler'ını bağlıyoruz (root WARNING'tan bağımsız çalışır).
if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
    _h = logging.StreamHandler()
    _h.setLevel(logging.INFO)
    _h.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)-7s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)
    logger.propagate = False

# Timezone-aware datetime helper
def now_tz():
    """Local timezone'ı kullanan datetime döndür"""
    return datetime.now(timezone.utc).astimezone()

router = APIRouter(
    prefix="/ping",
    tags=["ping"]
)

@router.post("/{device_id}", response_model=schemas.PingLogOut)
async def ping_single_device(device_id: int, db: Session = Depends(get_db)):
    """
    Belirli bir cihazı manuel olarak pingle ve sonucu kaydet.
    """
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    logger.info(f"Manual ping başlatıldı: {device.name} ({device.ip_address}) [id={device.id}]")
    ping_result = await PingService.ping_device(device.ip_address)

    # TCP port listesini DB'den oku
    ports_setting = db.query(models.Setting).filter(models.Setting.key == "tcp_scan_ports").first()
    tcp_ports = None
    if ports_setting and ports_setting.value:
        try:
            tcp_ports = [int(p.strip()) for p in ports_setting.value.split(",") if p.strip().isdigit()]
        except Exception:
            tcp_ports = None

    from ..services.network_scanner import scan_device
    result = await scan_device(device.ip_address, ping_result["success"], ping_result["response_time_ms"], tcp_ports=tcp_ports)

    success = result["success"]
    response_time = result["response_time_ms"]

    # Cihaz durumunu güncelle
    device.is_online = success
    device.last_ping_time = now_tz()
    device.last_response_time = response_time

    # Multi-method alanlarını güncelle
    if result.get("mac_address"):
        device.mac_address = result["mac_address"]
    if result.get("hostname"):
        device.hostname = result["hostname"]
    if result.get("vendor"):
        device.vendor = result["vendor"]
    device.detection_method = result.get("detection_method")
    device.open_ports = result.get("open_ports")

    # Log kaydı oluştur
    new_log = models.PingLog(
        device_id=device.id,
        success=success,
        response_time=response_time
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    status_txt = "ONLINE" if success else "OFFLINE"
    rt_txt = f"{response_time} ms" if response_time is not None else "-"
    method = result.get("detection_method") or "-"
    logger.info(
        f"Manual ping sonuc: {device.name} ({device.ip_address}) → {status_txt} | "
        f"response={rt_txt} | method={method}"
    )

    # WebSocket broadcast et (anlık güncellemeleri tüm clients'lara gönder)
    try:
        await manager.broadcast({
            "type": "device_pinged",
            "device_id": device.id,
            "name": device.name,
            "ip": device.ip_address,
            "is_online": device.is_online,
            "detection_method": device.detection_method,
            "response_time": device.last_response_time
        })
    except Exception as e:
        print(f"WS broadcast error: {e}")

    return new_log

@router.post("/all/scan")
async def scan_all_devices():
    """
    Tüm cihazlar için tarama işlemini arka planda başlatır.
    Fire-and-forget: scheduler'ın event loop'una submit edip dönüyoruz.
    """
    loop = getattr(network_scheduler.scheduler, "_eventloop", None)
    if loop and not loop.is_closed():
        asyncio.run_coroutine_threadsafe(network_scheduler.ping_all_devices(), loop)
        return {"message": "Scan initiated in background"}
    raise HTTPException(status_code=503, detail="Scheduler not running")

@router.get("/history/{device_id}", response_model=List[schemas.PingLogOut])
def get_ping_history(device_id: int, hours: int = 72, db: Session = Depends(get_db)):
    """
    Bir cihazın ping geçmişini getirir. hours=72 → 3 gün (max range).
    """
    since = now_tz() - timedelta(hours=max(1, min(hours, 72)))
    logs = db.query(models.PingLog)\
        .filter(
            models.PingLog.device_id == device_id,
            models.PingLog.timestamp >= since
        )\
        .order_by(models.PingLog.timestamp.desc())\
        .limit(5000)\
        .all()
    return logs

@router.get("/stats/summary", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Dashboard için genel istatistikleri hesaplar.
    """
    total = db.query(models.Device).count()
    online = db.query(models.Device).filter(models.Device.is_online == True).count()

    # En son tarama zamanını en son ping logundan al
    last_log = db.query(models.PingLog).order_by(models.PingLog.timestamp.desc()).first()
    last_scan_time = last_log.timestamp if last_log else None

    return {
        "total_devices": total,
        "online_devices": online,
        "offline_devices": total - online,
        "last_scan_time": last_scan_time
    }

@router.get("/uptime")
def get_uptime_all(db: Session = Depends(get_db)):
    """
    Tüm cihazlar için son 24 saat ve 7 günlük uptime yüzdesi.
    Veri kaynağı: ping_logs_hourly aggregate tablosu (kapanmış saatler için) +
    ping_logs raw tablosu (mevcut, henüz aggregate edilmemiş saat için).
    Bu sayede milyonlarca raw kaydı taramak yerine cihaz başına saatlik tek satır okunur.
    """
    from sqlalchemy import case as sa_case
    now = now_tz()
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_7d  = now - timedelta(days=7)

    # Aggregate tablodan: kapanmış saatler (current_hour'dan ÖNCE)
    def _agg_hourly(cutoff):
        rows = db.query(
            models.PingLogHourly.device_id,
            func.sum(models.PingLogHourly.total).label("total"),
            func.sum(models.PingLogHourly.success_count).label("ok"),
        ).filter(
            models.PingLogHourly.hour >= cutoff,
            models.PingLogHourly.hour < current_hour,
        ).group_by(models.PingLogHourly.device_id).all()
        return {r.device_id: (int(r.total or 0), int(r.ok or 0)) for r in rows}

    # Raw tablodan: yalnızca mevcut saatin verisi (rollup henüz çalışmadı)
    rows_current = db.query(
        models.PingLog.device_id,
        func.count().label("total"),
        func.sum(sa_case((models.PingLog.success == True, 1), else_=0)).label("ok"),
    ).filter(
        models.PingLog.timestamp >= current_hour,
    ).group_by(models.PingLog.device_id).all()
    current_map = {r.device_id: (int(r.total or 0), int(r.ok or 0)) for r in rows_current}

    map_24h = _agg_hourly(cutoff_24h)
    map_7d  = _agg_hourly(cutoff_7d)

    device_ids = [row[0] for row in db.query(models.Device.id).all()]
    result = {}
    for did in device_ids:
        t24, s24 = map_24h.get(did, (0, 0))
        t7,  s7  = map_7d.get(did,  (0, 0))
        ct, co = current_map.get(did, (0, 0))
        t24 += ct; s24 += co
        t7  += ct; s7  += co
        result[did] = {
            "uptime_24h": round(s24 / t24 * 100, 1) if t24 else None,
            "uptime_7d":  round(s7  / t7  * 100, 1) if t7  else None,
        }
    return result

@router.delete("/history/cleanup")
def cleanup_ping_history(days: int = 30, db: Session = Depends(get_db)):
    """
    Belirtilen günden eski ping kayıtlarını sil.
    """
    cutoff = now_tz() - timedelta(days=days)
    deleted = db.query(models.PingLog).filter(models.PingLog.timestamp < cutoff).delete()
    db.commit()
    return {"deleted": deleted, "older_than_days": days}
