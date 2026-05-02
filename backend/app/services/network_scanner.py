import asyncio
import subprocess
import socket
import re
import time
import logging
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)

DEFAULT_TCP_PORTS = [80, 443, 22, 3389, 445, 135, 8080, 8443]
TCP_TIMEOUT = 1  # saniye


def _tcp_connect(ip: str, port: int) -> bool:
    """Verilen IP:port'a TCP bağlantısı dener (senkron)."""
    try:
        with socket.create_connection((ip, port), timeout=TCP_TIMEOUT):
            return True
    except Exception:
        return False


def _arp_probe(ip: str) -> Optional[str]:
    """
    UDP datagramı göndererek OS'u Layer 2 ARP çözümlemesine zorlar,
    ardından ARP cache'den MAC adresini döndürür.

    Neden çalışır: OS bir IP'ye paket göndermeden önce MAC adresini öğrenmek için
    ARP broadcast yapar. Hedef cihaz ICMP/TCP bloklasa da ARP'a yanıt vermek zorundadır
    (Layer 2, host firewall'ının erişemediği seviye). UDP soketi kısa sürede timeout olur
    ama OS'un ARP tablosunu güncellemiş olması yeterli.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.1)
        try:
            # Port önemsiz — sadece OS'u ARP broadcast'e zorlamak için
            sock.sendto(b'\x00', (ip, 7))
        except OSError:
            pass  # "Connection refused" veya timeout — beklenen durum
        finally:
            sock.close()
    except Exception:
        pass

    # ARP tablosunun güncellenmesi için kısa bekle (thread içindeyiz, sleep güvenli)
    time.sleep(0.2)
    return _get_mac_from_arp(ip)


def _get_mac_from_arp(ip: str) -> Optional[str]:
    """Windows ARP tablosundan MAC adresini okur."""
    try:
        result = subprocess.run(
            ["arp", "-a", ip],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=3,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        output = result.stdout.decode("cp1254", errors="ignore")
        match = re.search(r"([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})", output)
        if match:
            return match.group(1).replace("-", ":").upper()
    except Exception:
        pass
    return None


def _get_hostname_dns(ip: str) -> Optional[str]:
    """Reverse DNS sorgusu ile hostname alır."""
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None


def _get_hostname_netbios(ip: str) -> Optional[str]:
    """nbtstat ile NetBIOS adını sorgular."""
    try:
        result = subprocess.run(
            ["nbtstat", "-A", ip],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        output = result.stdout.decode("cp1254", errors="ignore")
        # "<00>" tipli satırlardan bilgisayar adını çek
        match = re.search(r"^\s*(\S+)\s+<00>\s+UNIQUE", output, re.MULTILINE | re.IGNORECASE)
        if match:
            return match.group(1).strip()
    except Exception:
        pass
    return None


def _get_vendor(mac: str) -> Optional[str]:
    """MAC adresinden üretici bilgisini OUI veritabanından alır."""
    try:
        from mac_vendor_lookup import MacLookup
        return MacLookup().lookup(mac)
    except Exception:
        return None


async def arp_broadcast_scan(devices) -> Dict[str, bool]:
    """
    Tüm ARP grubu cihazlarını tek broadcast'te kontrol et.
    1. Tüm IP'lere UDP gönder (ARP cache refresh)
    2. 300ms bekle
    3. arp -a bir kez oku ve parse et
    """
    # ARP cache'i tazelemek için tüm IP'lere UDP gönder
    async def _udp_probe(ip):
        def _send():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.settimeout(0.1)
                sock.sendto(b'\x00', (ip, 9))
                sock.close()
            except Exception:
                pass
        await asyncio.to_thread(_send)

    probe_tasks = [_udp_probe(d.ip_address) for d in devices]
    await asyncio.gather(*probe_tasks)
    await asyncio.sleep(0.3)

    # arp -a bir kez oku
    try:
        result = await asyncio.to_thread(
            lambda: subprocess.run(
                ["arp", "-a"],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
            )
        )
        arp_output = result.stdout
    except Exception:
        arp_output = ""

    # IP'leri parse et
    online_ips = set(re.findall(r'(\d{1,3}(?:\.\d{1,3}){3})', arp_output))

    results = {}
    for device in devices:
        results[device.ip_address] = device.ip_address in online_ips
    return results


async def scan_device(ip: str, icmp_success: bool, icmp_response_ms: Optional[int], tcp_ports: Optional[List[int]] = None) -> Dict:
    """
    Tek bir cihaz için tam tarama yapar. Tespit sırası:
      1. ICMP
      2. TCP fallback (tcp_ports sırasıyla)
      3. ARP probe (Layer 2 — ICMP/TCP bloklayan cihazlar için)

    Döndürülen dict:
        success          : bool
        response_time_ms : int | None
        detection_method : str   ("ICMP" | "TCP (port X)" | "ARP" | "Ulaşılamadı")
        mac_address      : str | None
        hostname         : str | None
        vendor           : str | None
        open_ports       : str | None  (virgülle ayrılmış, ör "80,443")
    """
    logger.debug(f"scan_device: {ip} starting")
    ports = tcp_ports if tcp_ports else DEFAULT_TCP_PORTS
    detection_method = "Ulaşılamadı"
    success = icmp_success
    response_time_ms = icmp_response_ms
    open_port: Optional[int] = None

    if icmp_success:
        detection_method = "ICMP"
        logger.debug(f"  ICMP: online ({response_time_ms}ms)")
    else:
        logger.debug(f"  ICMP: offline")
        # TCP fallback — portları sırayla dene, ilk açık porta bağlanınca dur
        for port in ports:
            ok = await asyncio.to_thread(_tcp_connect, ip, port)
            logger.debug(f"    TCP {port}: {'open' if ok else 'closed'}")
            if ok:
                success = True
                open_port = port
                detection_method = f"TCP (port {port})"
                break

        # ARP probe — ICMP ve TCP başarısız ise Layer 2 denenir
        # Aynı subnet'teki cihazlar host firewall'ından bağımsız ARP'a yanıt verir
        if not success:
            logger.debug(f"  ARP: probing")
            arp_mac = await asyncio.to_thread(_arp_probe, ip)
            if arp_mac:
                success = True
                detection_method = "ARP"
                logger.debug(f"    ARP: online (MAC: {arp_mac})")
            else:
                logger.debug(f"    ARP: offline")

    # MAC → ARP cache'den
    mac: Optional[str] = None
    if success:
        mac = await asyncio.to_thread(_get_mac_from_arp, ip)
        if mac:
            logger.debug(f"  MAC: {mac}")

    # Hostname: önce DNS, sonra NetBIOS
    hostname: Optional[str] = None
    if success:
        hostname = await asyncio.to_thread(_get_hostname_dns, ip)
        if hostname:
            logger.debug(f"  Hostname (DNS): {hostname}")
        else:
            hostname = await asyncio.to_thread(_get_hostname_netbios, ip)
            if hostname:
                logger.debug(f"  Hostname (NetBIOS): {hostname}")

    # Vendor: MAC varsa OUI lookup
    vendor: Optional[str] = None
    if mac:
        vendor = await asyncio.to_thread(_get_vendor, mac)
        if vendor:
            logger.debug(f"  Vendor: {vendor}")

    # Açık portlar: ICMP başarılıysa tüm portları paralel tara
    # ARP ile tespit edilenlerde TCP portları kapalı — taramaya gerek yok
    open_ports_list: List[int] = []
    if icmp_success:
        results = await asyncio.gather(*[
            asyncio.to_thread(_tcp_connect, ip, p) for p in ports
        ])
        open_ports_list = [p for p, ok in zip(ports, results) if ok]
        if open_ports_list:
            logger.debug(f"  Open ports: {','.join(str(p) for p in open_ports_list)}")
    elif open_port is not None:
        open_ports_list = [open_port]

    open_ports_str = ",".join(str(p) for p in open_ports_list) if open_ports_list else None

    logger.debug(f"  Result: {detection_method}")
    return {
        "success": success,
        "response_time_ms": response_time_ms,
        "detection_method": detection_method,
        "mac_address": mac,
        "hostname": hostname,
        "vendor": vendor,
        "open_ports": open_ports_str,
    }
