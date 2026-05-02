import asyncio
import subprocess
import platform
import re
import socket
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class PingService:
    @staticmethod
    def _run_ping(cmd: list) -> tuple:
        """Senkron ping komutunu güvenli bir şekilde çalıştırır."""
        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                text=False,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
            )
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            return -1, b"", str(e).encode()

    @staticmethod
    async def ping_device(ip: str, timeout: int = 2) -> Dict:
        """
        Belirtilen IP adresine sistem üzerinden ping atar.
        Windows'ta daha kararlı olan senkron subprocess'i asenkron bir thread'de çalıştırır.
        """
        system = platform.system().lower()

        if system == "windows":
            cmd = ["ping", "-n", "1", "-w", str(timeout * 1000), ip]
        else:
            cmd = ["ping", "-c", "1", "-W", str(timeout), ip]

        try:
            returncode, stdout, stderr = await asyncio.to_thread(PingService._run_ping, cmd)

            output = ""
            for enc in ['cp850', 'cp1254', 'utf-8']:
                try:
                    output = stdout.decode(enc)
                    if output:
                        break
                except Exception:
                    continue

            if not output:
                output = stdout.decode('utf-8', errors='ignore')

            is_success = False
            output_up = output.upper()

            if returncode == 0:
                if system == "windows":
                    if "TTL=" in output_up or "MS" in output_up:
                        if "GEÇERSİZ" not in output_up and "ZAMAN AŞIMI" not in output_up and "TIMED OUT" not in output_up:
                            is_success = True
                else:
                    is_success = True

            response_time = None
            if is_success:
                match = (
                    re.search(r"zaman[=<]([\d\.]+)ms", output, re.I) or
                    re.search(r"time[=<]([\d\.]+)ms", output, re.I) or
                    re.search(r"time=([\d\.]+)\s*ms", output, re.I)
                )
                response_time = int(float(match.group(1))) if match else 1
                logger.debug(f"ICMP {ip}: online ({response_time}ms)")
            else:
                logger.debug(f"ICMP {ip}: offline")

            return {
                "success": is_success,
                "response_time_ms": response_time
            }

        except Exception as e:
            logger.debug(f"ICMP {ip}: error ({e})")
            return {
                "success": False,
                "response_time_ms": None
            }

    @staticmethod
    async def ping_icmp_batch(devices, semaphore, timeout_ms=2000):
        """Semaphore ile sınırlı paralel ICMP ping."""
        async def _limited_ping(device):
            async with semaphore:
                return await PingService.ping_device(device.ip_address, timeout=timeout_ms // 1000)
        tasks = [_limited_ping(d) for d in devices]
        results = await asyncio.gather(*tasks)
        online_count = sum(1 for r in results if r["success"])
        logger.debug(f"ping_icmp_batch: {online_count}/{len(devices)} online")
        return results

    @staticmethod
    async def ping_tcp_port(ip: str, port: int, timeout: float = 0.5) -> bool:
        """Tek TCP port kontrolü."""
        def _connect():
            try:
                s = socket.create_connection((ip, port), timeout=timeout)
                s.close()
                return True
            except Exception:
                return False
        return await asyncio.to_thread(_connect)

    @staticmethod
    async def scan_all(devices_list, tcp_ports=None):
        """Tüm cihazları paralel ping + multi-method tarama yapar."""
        from .network_scanner import scan_device

        semaphore = asyncio.Semaphore(50)

        # Önce tüm cihazlara ICMP ping at (Semaphore ile sınırlı)
        async def _limited_ping(device):
            async with semaphore:
                return await PingService.ping_device(device.ip_address)

        ping_tasks = [_limited_ping(device) for device in devices_list]
        ping_results = await asyncio.gather(*ping_tasks)

        # Sonra her cihaz için tam tarama yap (TCP, MAC, hostname, vendor)
        async def _limited_scan(device, pr):
            async with semaphore:
                return await scan_device(device.ip_address, pr["success"], pr["response_time_ms"], tcp_ports=tcp_ports)

        scan_tasks = [
            _limited_scan(device, pr)
            for device, pr in zip(devices_list, ping_results)
        ]
        return await asyncio.gather(*scan_tasks)
