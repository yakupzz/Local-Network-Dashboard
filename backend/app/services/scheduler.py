from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session
from sqlalchemy import func, case as sa_case
from ..database import SessionLocal, engine
from ..models import Device, PingLog, PingLogHourly, Setting
from .ping_service import PingService
from datetime import datetime, timedelta, timezone
from pathlib import Path
import asyncio
import logging
import sqlite3
import re

# Timezone-aware datetime helper
def now_tz():
    """Local timezone'ı kullanan datetime döndür"""
    return datetime.now(timezone.utc).astimezone()

logger = logging.getLogger(__name__)


def split_devices_by_method(devices):
    """
    Cihazları detection_method'larına göre 4 gruba ayırır:
      - icmp: detection_method == "ICMP"
      - tcp:  detection_method "TCP" ile başlıyor VE içinde "port <N>" var → (device, port)
      - arp:  detection_method == "ARP"
      - unknown: yukarıdakilerden hiçbiri
    quick_scan_cycle'dan ayrı bir yardımcıdır; saf fonksiyon olduğu için kolayca test edilir.
    """
    icmp_group, tcp_group, arp_group, unknown_group = [], [], [], []
    tcp_ports_map = {}  # device.id → port
    for d in devices:
        dm = d.detection_method or ""
        if dm == "ICMP":
            icmp_group.append(d)
        elif dm.startswith("TCP"):
            m = re.search(r'port (\d+)', dm)
            if m:
                tcp_group.append(d)
                tcp_ports_map[d.id] = int(m.group(1))
            else:
                unknown_group.append(d)
        elif dm == "ARP":
            arp_group.append(d)
        else:
            unknown_group.append(d)
    return {
        "icmp": icmp_group,
        "tcp": tcp_group,
        "arp": arp_group,
        "unknown": unknown_group,
        "tcp_ports_map": tcp_ports_map,
    }


class NetworkScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.is_running = False

    async def ping_all_devices(self):
        """
        Veritabanındaki tüm aktif cihazları pingle ve durumlarını güncelle.
        """
        db = SessionLocal()
        try:
            devices = db.query(Device).all()
            if not devices:
                return

            # TCP port listesini DB'den oku
            ports_setting = db.query(Setting).filter(Setting.key == "tcp_scan_ports").first()
            tcp_ports = None
            if ports_setting and ports_setting.value:
                try:
                    tcp_ports = [int(p.strip()) for p in ports_setting.value.split(",") if p.strip().isdigit()]
                except Exception:
                    tcp_ports = None

            logger.info(f"Scanning {len(devices)} devices...")

            # Tüm cihazları paralel pingle
            results = await PingService.scan_all(devices, tcp_ports=tcp_ports)

            for i, result in enumerate(results):
                device = devices[i]
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
                new_log = PingLog(
                    device_id=device.id,
                    success=success,
                    response_time=response_time
                )
                db.add(new_log)

            db.commit()
            logger.info("Full scan completed.")

            # WebSocket istemcilerine anlık bildirim gönder
            try:
                from ..ws import manager as ws_manager
                await ws_manager.broadcast({"type": "ping_complete"})
            except Exception as ws_err:
                logger.warning(f"WS broadcast error: {ws_err}")

        except Exception as e:
            logger.error(f"ping_all_devices error: {str(e)}")
            db.rollback()
        finally:
            db.close()

    async def quick_scan_cycle(self):
        """
        Grup bazlı hızlı tarama:
        - ICMP grubu: sadece ping (2s timeout, Semaphore)
        - TCP grubu: detection_method'dan port parse, tek TCP connect (0.5s)
        - ARP grubu: tek broadcast ARP
        - Online ise dur, offline ise fallback
        """
        from .network_scanner import arp_broadcast_scan

        db = SessionLocal()
        try:
            devices = db.query(Device).all()
            if not devices:
                return

            semaphore = asyncio.Semaphore(100)

            groups = split_devices_by_method(devices)
            icmp_group = groups["icmp"]
            tcp_group = groups["tcp"]
            arp_group = groups["arp"]
            unknown_group = groups["unknown"]
            tcp_ports_map = groups["tcp_ports_map"]

            logger.debug(f"quick_scan groups: ICMP={len(icmp_group)} TCP={len(tcp_group)} ARP={len(arp_group)} Unknown={len(unknown_group)}")

            changed = []

            # ICMP grubu
            if icmp_group:
                results = await PingService.ping_icmp_batch(icmp_group, semaphore, timeout_ms=2000)
                online_count = sum(1 for r in results if r["success"])
                logger.debug(f"ICMP group: {online_count}/{len(icmp_group)} online")
                for device, result in zip(icmp_group, results):
                    online = result["success"]
                    logger.debug(f"  {device.name} ({device.ip_address}): {'online' if online else 'offline'}")
                    if device.is_online != online:
                        device.is_online = online
                        device.last_ping_time = now_tz()
                        db.add(PingLog(device_id=device.id, success=online, response_time=result["response_time_ms"]))
                        changed.append((device, online))

            # TCP grubu
            if tcp_group:
                async def _check_tcp(device):
                    async with semaphore:
                        port = tcp_ports_map[device.id]
                        return await PingService.ping_tcp_port(device.ip_address, port, timeout=0.5)
                tcp_results = await asyncio.gather(*[_check_tcp(d) for d in tcp_group])
                online_count = sum(1 for r in tcp_results if r)
                logger.debug(f"TCP group: {online_count}/{len(tcp_group)} online")
                for device, online in zip(tcp_group, tcp_results):
                    port = tcp_ports_map[device.id]
                    logger.debug(f"  {device.name} ({device.ip_address}:{port}): {'online' if online else 'offline'}")
                    if device.is_online != online:
                        device.is_online = online
                        device.last_ping_time = now_tz()
                        db.add(PingLog(device_id=device.id, success=online, response_time=None))
                        changed.append((device, online))

            # ARP grubu — tek broadcast
            if arp_group:
                arp_results = await arp_broadcast_scan(arp_group)
                online_count = sum(1 for r in arp_results.values() if r)
                logger.debug(f"ARP group: {online_count}/{len(arp_group)} online")
                for device in arp_group:
                    online = arp_results.get(device.ip_address, False)
                    logger.debug(f"  {device.name} ({device.ip_address}): {'online' if online else 'offline'}")
                    if device.is_online != online:
                        device.is_online = online
                        device.last_ping_time = now_tz()
                        db.add(PingLog(device_id=device.id, success=online, response_time=None))
                        changed.append((device, online))

            if changed:
                db.commit()
                logger.info(f"Quick scan: {len(changed)} device status changes")
                from ..ws import manager as ws_manager
                for device, online in changed:
                    logger.debug(f"  {device.name} → {'online' if online else 'offline'}")
                    await ws_manager.broadcast({
                        "type": "device_online" if online else "device_offline",
                        "device_id": device.id,
                        "name": device.name,
                        "ip": device.ip_address
                    })

        except Exception as e:
            db.rollback()
            logger.error(f"Quick scan error: {e}")
        finally:
            db.close()

    async def rollup_hourly(self, hours_back: int = 2):
        """
        Son `hours_back` saatlik raw ping_logs'ları device_id+hour bazında
        özetleyip ping_logs_hourly tablosuna upsert eder.
        Tipik kullanım: her saat çalışır, son 2 saati yeniden hesaplar
        (mevcut saat hâlâ aktive olduğu için 1 saat geriye giderken eksik kalır).
        """
        db = SessionLocal()
        try:
            now = now_tz()
            cutoff = now - timedelta(hours=hours_back)

            # SQLite'da datetime'ı saat başına truncate et (strftime('%Y-%m-%d %H:00:00'))
            hour_expr = func.strftime("%Y-%m-%d %H:00:00", PingLog.timestamp)

            rows = db.query(
                PingLog.device_id,
                hour_expr.label("hour"),
                func.count().label("total"),
                func.sum(sa_case((PingLog.success == True, 1), else_=0)).label("ok"),
                func.avg(PingLog.response_time).label("avg_rt"),
            ).filter(
                PingLog.timestamp >= cutoff
            ).group_by(PingLog.device_id, hour_expr).all()

            written = 0
            for r in rows:
                hour_dt = datetime.strptime(r.hour, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                avg_rt = int(r.avg_rt) if r.avg_rt is not None else None
                existing = db.query(PingLogHourly).filter(
                    PingLogHourly.device_id == r.device_id,
                    PingLogHourly.hour == hour_dt,
                ).first()
                if existing:
                    existing.total = r.total
                    existing.success_count = int(r.ok or 0)
                    existing.avg_response_time = avg_rt
                else:
                    db.add(PingLogHourly(
                        device_id=r.device_id,
                        hour=hour_dt,
                        total=r.total,
                        success_count=int(r.ok or 0),
                        avg_response_time=avg_rt,
                    ))
                written += 1
            db.commit()
            logger.info(f"Rollup hourly: {written} buckets updated (last {hours_back}h)")
        except Exception as e:
            db.rollback()
            logger.error(f"Rollup hourly error: {e}")
        finally:
            db.close()

    async def cleanup_old_logs(self):
        """
        log_cleanup_days ayarına göre eski ping loglarını sil.
        """
        db = SessionLocal()
        try:
            setting = db.query(Setting).filter(Setting.key == "log_cleanup_days").first()
            if not setting or not setting.value:
                return
            days = int(setting.value)
            if days <= 0:
                return
            cutoff = now_tz() - timedelta(days=days)
            deleted = db.query(PingLog).filter(PingLog.timestamp < cutoff).delete()
            db.commit()
            logger.info(f"Log cleanup: {deleted} records deleted (older than {days} days)")
        except Exception as e:
            logger.error(f"Log cleanup error: {e}")
            db.rollback()
        finally:
            db.close()

    async def backup_database(self):
        """
        Günlük veritabanı yedeklemesi. SQLite online backup API kullanır.
        7 günden eski yedekleri otomatik siler.
        """
        try:
            backup_dir = Path(__file__).parent.parent.parent / "backups"
            backup_dir.mkdir(exist_ok=True)

            date_str = now_tz().strftime("%Y-%m-%d")
            dst_path = backup_dir / f"backup_{date_str}.db"
            src_path = Path(__file__).parent.parent.parent / "network_monitor.db"

            if not src_path.exists():
                logger.warning(f"Database file not found: {src_path}")
                return

            src = sqlite3.connect(str(src_path))
            dst = sqlite3.connect(str(dst_path))
            src.backup(dst)
            dst.close()
            src.close()

            logger.info(f"Backup completed: {dst_path}")

            all_backups = sorted(backup_dir.glob("backup_*.db"))
            if len(all_backups) > 7:
                for f in all_backups[:-7]:
                    f.unlink()
                    logger.debug(f"Deleted old backup: {f.name}")

        except Exception as e:
            logger.error(f"Backup error: {e}")

    def start(self, interval_seconds: int = 300, quick_check_interval: int = 60):
        """
        Zamanlayıcıyı başlat.
        - ping_job: Tam tarama (MAC, vendor, hostname, port scan)
        - quick_scan_job: Grup bazlı hızlı tarama
        """
        if not self.is_running:
            self.scheduler.add_job(
                self.ping_all_devices,
                "interval",
                seconds=interval_seconds,
                id="ping_job",
                replace_existing=True
            )
            # Hızlı tarama döngüsü (grup bazlı)
            self.scheduler.add_job(
                self.quick_scan_cycle,
                "interval",
                seconds=quick_check_interval,
                id="quick_scan_job",
                replace_existing=True
            )
            # Her gün gece 02:00'da veritabanını yedekle
            self.scheduler.add_job(
                self.backup_database,
                "cron",
                hour=2,
                minute=0,
                id="backup_job",
                replace_existing=True
            )
            # Her saatin 5. dakikasında raw log'ları aggregate tabloya rollup et
            self.scheduler.add_job(
                self.rollup_hourly,
                "cron",
                minute=5,
                id="rollup_hourly_job",
                replace_existing=True
            )
            # Her gün gece 03:00'da eski logları temizle
            self.scheduler.add_job(
                self.cleanup_old_logs,
                "cron",
                hour=3,
                minute=0,
                id="cleanup_job",
                replace_existing=True
            )
            self.scheduler.start()
            self.is_running = True
            logger.info(f"Scheduler started with {interval_seconds}s (ping) and {quick_check_interval}s (quick scan) intervals")

    def stop(self):
        """
        Zamanlayıcıyı durdur.
        """
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
            logger.info("Scheduler stopped")

    def update_interval(self, new_interval: int):
        """
        Ping aralığını dinamik olarak güncelle.
        """
        if self.is_running:
            self.scheduler.reschedule_job("ping_job", trigger="interval", seconds=new_interval)
            print(f"Interval updated to {new_interval}s.")

# Global örnek
network_scheduler = NetworkScheduler()
