from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case as sa_case
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from ..database import get_db
from .. import models, schemas


def _now_tz():
    return datetime.now(timezone.utc).astimezone()

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"]
)

@router.get("/summary", response_model=schemas.DashboardStats)
def get_summary(db: Session = Depends(get_db)):
    """
    Dashboard üst barı için özet bilgiler.
    """
    total = db.query(models.Device).count()
    online = db.query(models.Device).filter(models.Device.is_online == True).count()

    last_log = db.query(models.PingLog).order_by(models.PingLog.timestamp.desc()).first()
    last_scan = last_log.timestamp if last_log else None

    return {
        "total_devices": total,
        "online_devices": online,
        "offline_devices": total - online,
        "last_scan_time": last_scan
    }

@router.get("/device-performance/{device_id}")
def get_device_performance(device_id: int, days: int = 7, db: Session = Depends(get_db)):
    """
    Belirli bir cihazın son X gündeki performans verileri.
    """
    since = datetime.now() - timedelta(days=days)

    logs = db.query(models.PingLog).filter(
        models.PingLog.device_id == device_id,
        models.PingLog.timestamp >= since
    ).all()

    if not logs:
        return {"uptime_percent": 0, "avg_latency": 0, "total_pings": 0}

    success_count = sum(1 for log in logs if log.success)
    latencies = [log.response_time for log in logs if log.success and log.response_time is not None]

    return {
        "uptime_percent": round((success_count / len(logs)) * 100, 2),
        "avg_latency": round(sum(latencies) / len(latencies), 2) if latencies else 0,
        "total_pings": len(logs),
        "success_pings": success_count,
        "failed_pings": len(logs) - success_count
    }

@router.get("/trend")
def get_trend(hours: int = 24, db: Session = Depends(get_db)):
    """
    Son N saatteki her saatlik dilimde online/offline ping sayısı.
    Veri kaynağı:
      - Kapanmış saatler için ping_logs_hourly aggregate tablosu (1 satır/cihaz/saat)
      - Mevcut (henüz aggregate edilmemiş) saat için ping_logs raw tablosu
    SQL tarafında GROUP BY ile toplanır; Python tarafına yalnızca bucket sayısı kadar satır gelir.
    """
    now = _now_tz()
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    since = now - timedelta(hours=hours)

    buckets: dict = {}

    # Kapanmış saatler — aggregate tablosundan
    hourly_rows = db.query(
        models.PingLogHourly.hour.label("hour"),
        func.sum(models.PingLogHourly.success_count).label("online"),
        func.sum(models.PingLogHourly.total - models.PingLogHourly.success_count).label("offline"),
    ).filter(
        models.PingLogHourly.hour >= since,
        models.PingLogHourly.hour < current_hour,
    ).group_by(models.PingLogHourly.hour).all()

    for r in hourly_rows:
        # SQLite hour kolonunu string olarak dönebilir; her iki durumu da tolere et
        if isinstance(r.hour, str):
            try:
                key = datetime.fromisoformat(r.hour.replace(" ", "T"))
            except ValueError:
                continue
        else:
            key = r.hour
        buckets[key] = {"online": int(r.online or 0), "offline": int(r.offline or 0)}

    # Mevcut saat — raw tablodan
    current_row = db.query(
        func.sum(sa_case((models.PingLog.success == True, 1), else_=0)).label("online"),
        func.sum(sa_case((models.PingLog.success == False, 1), else_=0)).label("offline"),
    ).filter(models.PingLog.timestamp >= current_hour).one()

    online_now = int(current_row.online or 0)
    offline_now = int(current_row.offline or 0)
    if online_now or offline_now:
        buckets[current_hour] = {"online": online_now, "offline": offline_now}

    return [
        {"time": dt.strftime("%H:%M"), "online": v["online"], "offline": v["offline"]}
        for dt, v in sorted(buckets.items())
    ]

@router.get("/recent-events")
def get_recent_events(limit: int = 10, db: Session = Depends(get_db)):
    """
    Son durum değişikliklerini (online->offline veya tersi) listele.
    (Basitlik için son başarısız logları dönelim şimdilik)
    """
    recent_failures = db.query(models.PingLog, models.Device)\
        .join(models.Device)\
        .filter(models.PingLog.success == False)\
        .order_by(models.PingLog.timestamp.desc())\
        .limit(limit)\
        .all()

    return [
        {
            "device_name": device.name,
            "ip_address": device.ip_address,
            "timestamp": log.timestamp,
            "status": "offline"
        } for log, device in recent_failures
    ]
