#!/usr/bin/env python3
"""
Grandmedical Hastanesi — Network Monitor Sistem Tepsisi
"""
import sys
import json
import socket
import subprocess
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

from PySide6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QLineEdit, QSystemTrayIcon, QMenu, QFrame,
)
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import (
    QIcon, QPixmap, QPainter, QColor, QBrush, QPen,
    QFont, QAction,
)

ROOT_DIR     = Path(__file__).parent
BACKEND_DIR  = ROOT_DIR / "backend"
LOG_DIR      = BACKEND_DIR / "log"
SERVER_LOG   = LOG_DIR / "server.log"
TRAY_LOG     = LOG_DIR / "tray.log"
VENV_PY      = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
CONFIG_FILE  = ROOT_DIR / "tray_config.json"
ENV_FILE     = BACKEND_DIR / ".env"


def read_env_var(key: str) -> str:
    """backend/.env içinden tek bir env var'ı okur. Yoksa boş string."""
    if not ENV_FILE.exists():
        return ""
    try:
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() == key:
                return v.strip()
    except Exception:
        pass
    return ""


def auth_headers() -> dict:
    """API_TOKEN set edildiyse Authorization header'ını döner."""
    token = read_env_var("API_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


# ─── Log yardımcısı ───────────────────────────────────────────────────────────
def tray_log(msg: str):
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with TRAY_LOG.open("a", encoding="utf-8") as f:
            f.write(f"[{ts}] {msg}\n")
    except Exception:
        pass


# ─── Config ───────────────────────────────────────────────────────────────────
def load_cfg() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"port": 8000, "dark": True, "debug": False}

def save_cfg(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


# ─── Network ──────────────────────────────────────────────────────────────────
def local_ips() -> list:
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None):
            ip = info[4][0]
            if ":" not in ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips or ["127.0.0.1"]


def kill_port(port: int):
    """Windows'ta belirtilen portu kullanan prosesi sonlandırır."""
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and ("LISTENING" in line or "DINLEME" in line):
                parts = line.strip().split()
                pid = int(parts[-1])
                if pid > 0:
                    subprocess.run(
                        ["taskkill", "/F", "/PID", str(pid)],
                        capture_output=True, timeout=5,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                    tray_log(f"Port {port} meşguldu, PID {pid} sonlandırıldı.")
    except Exception as e:
        tray_log(f"kill_port hatası: {e}")


# ─── İkon — QApplication kurulduktan SONRA çağrılmalı ────────────────────────
def make_icon(color: str) -> QIcon:
    sz = 64
    pix = QPixmap(sz, sz)
    pix.fill(Qt.GlobalColor.transparent)
    p = QPainter(pix)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setBrush(QBrush(QColor(color)))
    p.setPen(Qt.PenStyle.NoPen)
    p.drawRoundedRect(4, 4, sz - 8, sz - 8, 14, 14)
    p.setPen(QPen(QColor("white")))
    p.setFont(QFont("Segoe UI", 24, QFont.Weight.Bold))
    p.drawText(pix.rect(), Qt.AlignmentFlag.AlignCenter, "N")
    p.end()
    return QIcon(pix)


# ─── QSS Stil ─────────────────────────────────────────────────────────────────
def build_qss(dark: bool) -> str:
    if dark:
        bg, surf, brd, txt, mut, inp = (
            "#111827", "#1f2937", "#374151", "#f9fafb", "#9ca3af", "#0d1523",
        )
    else:
        bg, surf, brd, txt, mut, inp = (
            "#f0f2f5", "#ffffff", "#d1d5db", "#111827", "#6b7280", "#ffffff",
        )
    return f"""
    QWidget#root {{ background: {bg}; }}
    QFrame#card  {{ background: {surf}; border: 1px solid {brd}; border-radius: 14px; }}
    QLabel {{ color: {txt}; background: transparent; font-family: "Segoe UI"; }}
    QLabel#muted      {{ color: {mut}; font-size: 11px; }}
    QLabel#title      {{ font-size: 14px; font-weight: 700; }}
    QLabel#status_on  {{ color: #10b981; font-size: 13px; font-weight: 700; }}
    QLabel#status_off {{ color: #ef4444; font-size: 13px; font-weight: 700; }}
    QLineEdit {{
        background: {inp}; border: 1.5px solid {brd}; border-radius: 8px;
        padding: 6px 10px; color: {txt}; font-size: 13px; font-family: "Consolas";
    }}
    QLineEdit:focus {{ border-color: #2563eb; }}
    QScrollBar:vertical {{ width: 6px; background: transparent; }}
    QScrollBar::handle:vertical {{ background: {brd}; border-radius: 3px; min-height: 20px; }}
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
    QPushButton#btn_success {{
        background: #10b981; color: white; border: none;
        border-radius: 8px; padding: 9px 0; font-weight: 700; font-size: 13px;
    }}
    QPushButton#btn_success:hover    {{ background: #059669; }}
    QPushButton#btn_success:disabled {{ background: {brd}; color: {mut}; }}
    QPushButton#btn_danger {{
        background: #ef4444; color: white; border: none;
        border-radius: 8px; padding: 9px 0; font-weight: 700; font-size: 13px;
    }}
    QPushButton#btn_danger:hover    {{ background: #dc2626; }}
    QPushButton#btn_danger:disabled {{ background: {brd}; color: {mut}; }}
    QPushButton#btn_flat {{
        background: {surf}; color: {mut}; border: 1.5px solid {brd};
        border-radius: 8px; padding: 6px 14px; font-size: 12px;
    }}
    QPushButton#btn_flat:hover {{ color: {txt}; border-color: #2563eb; }}
    QPushButton#btn_icon {{
        background: transparent; border: none; color: {mut};
        font-size: 15px; padding: 2px 6px; border-radius: 6px;
    }}
    QPushButton#btn_icon:hover {{ background: {"#374151" if dark else "#e5e7eb"}; color: {txt}; }}
    QFrame#sep {{ background: {brd}; max-height: 1px; }}
    """


# ─── Ana Pencere ──────────────────────────────────────────────────────────────
class Window(QWidget):
    def __init__(self, app: "TrayApp"):
        super().__init__()
        self._app  = app
        self._drag = None
        self._build()

    def _build(self):
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setObjectName("root")
        self.setFixedSize(480, 380)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(10, 10, 10, 10)

        card = QFrame()
        card.setObjectName("card")
        cl = QVBoxLayout(card)
        cl.setContentsMargins(22, 18, 22, 20)
        cl.setSpacing(12)

        # ── Başlık ──────────────────────────────────────────────────
        hdr = QHBoxLayout()
        hdr.setSpacing(8)
        ico_lbl = QLabel("🖧")
        ico_lbl.setFont(QFont("Segoe UI", 16))
        title_lbl = QLabel("Network Monitor")
        title_lbl.setObjectName("title")
        hdr.addWidget(ico_lbl)
        hdr.addWidget(title_lbl)
        hdr.addStretch()

        self._theme_btn = QPushButton()
        self._theme_btn.setObjectName("btn_icon")
        self._theme_btn.setFixedSize(30, 26)
        self._theme_btn.clicked.connect(self._app.toggle_theme)
        hdr.addWidget(self._theme_btn)

        close_btn = QPushButton("✕")
        close_btn.setObjectName("btn_icon")
        close_btn.setFixedSize(28, 26)
        close_btn.setToolTip("Tepsiye küçült")
        close_btn.clicked.connect(self.hide)
        hdr.addWidget(close_btn)
        cl.addLayout(hdr)

        sep = QFrame()
        sep.setObjectName("sep")
        sep.setFrameShape(QFrame.Shape.HLine)
        cl.addWidget(sep)

        # ── Durum ───────────────────────────────────────────────────
        self._status_lbl = QLabel()
        self._status_lbl.setObjectName("status_on")
        cl.addWidget(self._status_lbl)

        # ── IP adresleri ────────────────────────────────────────────
        self._ip_lbl = QLabel()
        self._ip_lbl.setObjectName("muted")
        self._ip_lbl.setTextFormat(Qt.TextFormat.RichText)
        self._ip_lbl.setOpenExternalLinks(True)
        self._ip_lbl.setWordWrap(True)
        cl.addWidget(self._ip_lbl)

        # ── Port ayarı ──────────────────────────────────────────────
        port_row = QHBoxLayout()
        port_row.setSpacing(8)
        port_row.addWidget(QLabel("Port:"))
        self._port_in = QLineEdit()
        self._port_in.setFixedWidth(72)
        self._port_in.setMaxLength(5)
        apply_btn = QPushButton("Uygula")
        apply_btn.setObjectName("btn_flat")
        apply_btn.setFixedWidth(76)
        apply_btn.clicked.connect(self._apply_port)
        self._port_in.returnPressed.connect(self._apply_port)
        port_row.addWidget(self._port_in)
        port_row.addWidget(apply_btn)
        port_row.addStretch()
        cl.addLayout(port_row)

        # ── Tarama Aralıkları ────────────────────────────────────────
        scan_row = QHBoxLayout()
        scan_row.setSpacing(8)
        scan_row.addWidget(QLabel("Hızlı Tarama:"))
        self._quick_scan_in = QLineEdit()
        self._quick_scan_in.setFixedWidth(60)
        self._quick_scan_in.setMaxLength(4)
        scan_row.addWidget(self._quick_scan_in)
        scan_row.addWidget(QLabel("san"))
        scan_row.addSpacing(12)
        scan_row.addWidget(QLabel("Ping Taraması:"))
        self._ping_scan_in = QLineEdit()
        self._ping_scan_in.setFixedWidth(60)
        self._ping_scan_in.setMaxLength(4)
        scan_row.addWidget(self._ping_scan_in)
        scan_row.addWidget(QLabel("san"))
        scan_apply_btn = QPushButton("Uygula")
        scan_apply_btn.setObjectName("btn_flat")
        scan_apply_btn.setFixedWidth(76)
        scan_apply_btn.clicked.connect(self._apply_scan_settings)
        scan_row.addWidget(scan_apply_btn)
        scan_row.addStretch()
        cl.addLayout(scan_row)

        # ── Başlat / Durdur ─────────────────────────────────────────
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)
        self._start_btn = QPushButton("▶   Servisi Başlat")
        self._start_btn.setObjectName("btn_success")
        self._start_btn.clicked.connect(self._app.start_server)
        self._stop_btn  = QPushButton("■   Servisi Durdur")
        self._stop_btn.setObjectName("btn_danger")
        self._stop_btn.clicked.connect(self._app.stop_server)
        btn_row.addWidget(self._start_btn)
        btn_row.addWidget(self._stop_btn)
        cl.addLayout(btn_row)

        # ── Dev Server satırı ───────────────────────────────────────
        dev_row = QHBoxLayout()
        dev_row.setSpacing(10)
        self._dev_btn = QPushButton("▶   Dev Server Başlat")
        self._dev_btn.setObjectName("btn_flat")
        self._dev_btn.clicked.connect(self._app.toggle_dev_server)
        self._open_btn = QPushButton("🌐   Tarayıcıda Aç")
        self._open_btn.setObjectName("btn_flat")
        self._open_btn.clicked.connect(self._open_browser)
        dev_row.addWidget(self._dev_btn)
        dev_row.addWidget(self._open_btn)
        cl.addLayout(dev_row)

        outer.addWidget(card)

    # ── Yenile ──────────────────────────────────────────────────────
    def refresh(self):
        running = self._app.is_running()
        port    = self._app.cfg["port"]
        dark    = self._app.cfg["dark"]
        ips     = local_ips()

        if running:
            self._status_lbl.setText("● ÇALIŞIYOR")
            self._status_lbl.setObjectName("status_on")
        else:
            self._status_lbl.setText("○ DURDURULDU")
            self._status_lbl.setObjectName("status_off")
        self._status_lbl.style().unpolish(self._status_lbl)
        self._status_lbl.style().polish(self._status_lbl)

        links = "&nbsp;&nbsp;".join(
            f'<a href="http://{ip}:{port}" style="color:#2563eb;text-decoration:none">'
            f'http://{ip}:{port}</a>'
            for ip in ips
        )
        self._ip_lbl.setText(links)
        self._start_btn.setEnabled(not running)
        self._stop_btn.setEnabled(running)
        self._port_in.setText(str(port))
        self._theme_btn.setText("☀️" if dark else "🌙")

        dev_running = self._app.is_dev_running()
        self._dev_btn.setText("■   Dev Server Durdur" if dev_running else "▶   Dev Server Başlat")
        self._open_btn.setEnabled(running or dev_running)

        # Backend'den tarama aralıklarını senkron yükle (port gibi)
        if running:
            self._app.load_scan_settings_sync(self)
            self._quick_scan_in.setEnabled(True)
            self._ping_scan_in.setEnabled(True)
        else:
            # Backend kapalıysa cache'den son değerleri göster ve edit'i disable et
            self._quick_scan_in.setText(self._app._cached_quick_scan)
            self._ping_scan_in.setText(self._app._cached_ping_interval)
            self._quick_scan_in.setEnabled(False)
            self._ping_scan_in.setEnabled(False)

    def apply_theme(self):
        self.setStyleSheet(build_qss(self._app.cfg["dark"]))
        self.refresh()

    def _open_browser(self):
        import webbrowser
        if self._app.is_dev_running():
            webbrowser.open("http://localhost:5173")
        else:
            port = self._app.cfg["port"]
            ips  = local_ips()
            url  = f"http://{ips[0]}:{port}" if ips else f"http://localhost:{port}"
            webbrowser.open(url)

    def _apply_port(self):
        txt = self._port_in.text().strip()
        if txt.isdigit() and 1024 <= int(txt) <= 65535:
            new_port = int(txt)
            if new_port != self._app.cfg["port"]:
                self._app.cfg["port"] = new_port
                save_cfg(self._app.cfg)
                if self._app.is_running():
                    self._app.stop_server()
                    QTimer.singleShot(1500, self._app.start_server)
                else:
                    self.refresh()
        else:
            self._port_in.setText(str(self._app.cfg["port"]))

    def _apply_scan_settings(self):
        quick_scan_txt = self._quick_scan_in.text().strip()
        ping_scan_txt = self._ping_scan_in.text().strip()

        success = True
        if quick_scan_txt.isdigit() and 5 <= int(quick_scan_txt) <= 86400:  # 5s to 24h
            self._app.update_setting_async("quick_scan_interval", quick_scan_txt)
        elif quick_scan_txt:
            success = False

        if ping_scan_txt.isdigit() and 10 <= int(ping_scan_txt) <= 86400:  # 10s to 24h
            self._app.update_setting_async("ping_interval", ping_scan_txt)
        elif ping_scan_txt:
            success = False

        if success:
            # Güncelleme başarılı: 1 saniye sonra DB'den doğru değerleri yükle
            QTimer.singleShot(1000, self.refresh)
        else:
            # Geçersiz değerler: hemen geri yükle
            self.refresh()

    # ── Sürükleme ───────────────────────────────────────────────────
    def mousePressEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton:
            self._drag = e.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, e):
        if self._drag and e.buttons() == Qt.MouseButton.LeftButton:
            self.move(e.globalPosition().toPoint() - self._drag)

    def mouseReleaseEvent(self, e):
        self._drag = None

    def closeEvent(self, e):
        e.ignore()
        self.hide()


# ─── Tray Uygulaması ──────────────────────────────────────────────────────────
class TrayApp:
    def __init__(self):
        self.qt = QApplication(sys.argv)
        self.qt.setQuitOnLastWindowClosed(False)

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        tray_log("=== Tray uygulaması başlatıldı ===")

        # İkonlar QApplication kurulduktan SONRA oluşturulmalı
        self._ico_on  = make_icon("#10b981")
        self._ico_off = make_icon("#6b7280")
        self._ico_err = make_icon("#ef4444")

        self.cfg       = load_cfg()
        self._proc     = None
        self._dev_proc = None
        self._log_file = None
        self._cached_quick_scan = "60"
        self._cached_ping_interval = "300"

        self.win = Window(self)
        self.win.setStyleSheet(build_qss(self.cfg["dark"]))
        self.win.refresh()

        self._build_tray()

        self._monitor = QTimer()
        self._monitor.timeout.connect(self._check_proc)
        self._monitor.start(2000)

        # Uygulama kapatılırken port'ları temizle (normal quit veya force kill)
        self.qt.aboutToQuit.connect(self._cleanup)

        self.start_server()

    # ── Tray ────────────────────────────────────────────────────────
    def _build_tray(self):
        self.tray = QSystemTrayIcon()
        self.tray.setIcon(self._ico_off)
        self.tray.setToolTip("Grandmedical — Network Monitor")
        self.tray.activated.connect(self._activated)

        menu = QMenu()
        debug_label = "🔍 Debug: AÇIK" if self.cfg.get("debug", False) else "🔍 Debug: KAPALI"

        for label, slot in [
            ("🖥  Aç / Göster",      self._show_win),
            (None, None),
            ("▶  Servisi Başlat",    self.start_server),
            ("■  Servisi Durdur",    self.stop_server),
            (None, None),
            (debug_label,            self.toggle_debug),
            ("🧹 Logları Temizle",   self.clear_logs),
            (None, None),
            ("✕  Uygulamayı Kapat", self._quit),
        ]:
            if label is None:
                menu.addSeparator()
            else:
                act = QAction(label, menu)
                act.triggered.connect(slot)
                if label.startswith("🔍"):
                    self._debug_action = act
                menu.addAction(act)

        self.tray.setContextMenu(menu)
        self.tray.show()

    def _activated(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self._show_win()

    def _show_win(self):
        self.win.refresh()
        if self.win.isVisible():
            self.win.hide()
            return
        scr = self.qt.primaryScreen().availableGeometry()
        w, h = self.win.width(), self.win.height()
        self.win.move(scr.right() - w - 16, scr.bottom() - h - 16)
        self.win.show()
        self.win.raise_()
        self.win.activateWindow()

    # ── Servis yönetimi ─────────────────────────────────────────────
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start_server(self):
        if self.is_running():
            return

        # Portu meşgul eden varsa önce temizle
        kill_port(self.cfg["port"])

        python = str(VENV_PY) if VENV_PY.exists() else sys.executable
        cmd = [
            python, "-m", "uvicorn", "app.main:app",
            "--host", "0.0.0.0",
            "--port", str(self.cfg["port"]),
            "--workers", "4",
        ]

        try:
            self._log_file = SERVER_LOG.open("a", encoding="utf-8", buffering=1)
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._log_file.write(
                f"\n{'='*60}\n[{ts}] Servis başlatıldı — port {self.cfg['port']}\n{'='*60}\n"
            )
            self._log_file.flush()
        except Exception as e:
            tray_log(f"server.log açılamadı: {e}")
            self._log_file = None

        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        self._proc = subprocess.Popen(
            cmd,
            cwd=str(BACKEND_DIR),
            stdout=self._log_file,
            stderr=self._log_file,
            stdin=subprocess.DEVNULL,
            creationflags=flags,
        )

        tray_log(f"Servis başlatıldı — PID {self._proc.pid}, port {self.cfg['port']}")

        self.tray.setIcon(self._ico_on)
        self.tray.setToolTip(f"Network Monitor {self.cfg['port']} ● Çalışıyor")
        self.tray.showMessage(
            "Network Monitor",
            f"Servis başlatıldı  ·  port {self.cfg['port']}",
            QSystemTrayIcon.MessageIcon.Information, 3000,
        )
        self.win.refresh()

    def stop_server(self):
        if not self.is_running():
            return
        pid = self._proc.pid
        # Windows: terminate() sadece ana prosesi öldürür, uvicorn worker'ları yaşar.
        # taskkill /T tüm process ağacını (worker'lar dahil) öldürür.
        if sys.platform == "win32":
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True, timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
            except Exception as e:
                tray_log(f"taskkill hatası: {e}")
                self._proc.kill()
        else:
            self._proc.terminate()
        try:
            self._proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._proc.kill()
        self._proc = None
        # Port hâlâ meşgulse temizle (worker hayatta kaldıysa)
        kill_port(self.cfg["port"])
        self._close_log_file()
        tray_log("Servis manuel olarak durduruldu.")
        self.tray.setIcon(self._ico_off)
        self.tray.setToolTip("Network Monitor ○ Durduruldu")
        self.tray.showMessage(
            "Network Monitor", "Servis durduruldu.",
            QSystemTrayIcon.MessageIcon.Warning, 2500,
        )
        self.win.refresh()

    def _close_log_file(self):
        if self._log_file:
            try:
                self._log_file.close()
            except Exception:
                pass
            self._log_file = None

    def toggle_theme(self):
        self.cfg["dark"] = not self.cfg["dark"]
        save_cfg(self.cfg)
        self.win.apply_theme()

    def toggle_debug(self):
        self.cfg["debug"] = not self.cfg.get("debug", False)
        save_cfg(self.cfg)
        debug_state = "AÇIK" if self.cfg["debug"] else "KAPALI"
        debug_value = "true" if self.cfg["debug"] else "false"

        api_updated = False
        if self.is_running():
            try:
                port = self.cfg.get("port", 5770)
                data = json.dumps({"value": debug_value}).encode()
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/settings/debug_mode",
                    data=data, method="PUT",
                    headers={"Content-Type": "application/json", **auth_headers()}
                )
                urllib.request.urlopen(req, timeout=2)
                api_updated = True
            except Exception:
                pass

        # Backend kapalıysa veya API başarısız olduysa doğrudan SQLite'a yaz
        if not api_updated:
            self._write_setting_db("debug_mode", debug_value)

        try:
            self._debug_action.setText(f"🔍 Debug: {debug_state}")
        except Exception:
            pass

        tray_log(f"Debug modu: {debug_state}")

    def update_setting_async(self, key: str, value: str):
        """Backend ayarını asenkron güncelle"""
        if not self.is_running():
            return

        def _update():
            try:
                port = self.cfg.get("port", 5770)
                data = json.dumps({"value": value}).encode()
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/settings/{key}",
                    data=data, method="PUT",
                    headers={"Content-Type": "application/json", **auth_headers()}
                )
                resp = urllib.request.urlopen(req, timeout=2)
                body = resp.read().decode()
                tray_log(f"OK Ayar: {key}={value}")
            except urllib.error.HTTPError as e:
                try:
                    body = e.read().decode()
                except:
                    body = ""
                tray_log(f"HTTP Error ({key}): {e.code} - {body[:200]}")
            except Exception as e:
                tray_log(f"ERROR Ayar ({key}): {e}")

        # Thread'de çalıştır (UI block olmasın)
        from threading import Thread
        Thread(target=_update, daemon=True).start()

    def load_scan_settings_sync(self, win):
        """Backend'den tarama aralıklarını senkron yükle (refresh sırasında)"""
        if not self.is_running():
            return

        port = self.cfg.get("port", 5770)

        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/settings/quick_scan_interval",
                headers={"Content-Type": "application/json", **auth_headers()}
            )
            resp = urllib.request.urlopen(req, timeout=2)
            data = json.loads(resp.read().decode())
            quick_val = str(data.get("value", "60"))
            self._cached_quick_scan = quick_val  # Cache'e kaydet
            win._quick_scan_in.setText(quick_val)
            tray_log(f"SYNC LOAD quick_scan_interval={quick_val}")
        except Exception as e:
            tray_log(f"SYNC LOAD quick_scan_interval ERROR: {e}")
            win._quick_scan_in.setText(self._cached_quick_scan)

        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/settings/ping_interval",
                headers={"Content-Type": "application/json", **auth_headers()}
            )
            resp = urllib.request.urlopen(req, timeout=2)
            data = json.loads(resp.read().decode())
            ping_val = str(data.get("value", "300"))
            self._cached_ping_interval = ping_val  # Cache'e kaydet
            win._ping_scan_in.setText(ping_val)
            tray_log(f"SYNC LOAD ping_interval={ping_val}")
        except Exception as e:
            tray_log(f"SYNC LOAD ping_interval ERROR: {e}")
            win._ping_scan_in.setText(self._cached_ping_interval)

    def load_scan_settings_async(self, win):
        """Backend'den tarama aralıklarını asenkron yükle"""
        if not self.is_running():
            win._quick_scan_in.setText("60")
            win._ping_scan_in.setText("300")
            return

        def _load():
            port = self.cfg.get("port", 5770)

            quick_val = "60"
            ping_val = "300"

            try:
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/settings/quick_scan_interval",
                    headers={"Content-Type": "application/json", **auth_headers()}
                )
                resp = urllib.request.urlopen(req, timeout=2)
                data = json.loads(resp.read().decode())
                quick_val = str(data.get("value", "60"))
                tray_log(f"LOAD quick_scan_interval={quick_val}")
            except Exception as e:
                tray_log(f"LOAD quick_scan_interval ERROR: {e}")

            try:
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/settings/ping_interval",
                    headers={"Content-Type": "application/json", **auth_headers()}
                )
                resp = urllib.request.urlopen(req, timeout=2)
                data = json.loads(resp.read().decode())
                ping_val = str(data.get("value", "300"))
                tray_log(f"LOAD ping_interval={ping_val}")
            except Exception as e:
                tray_log(f"LOAD ping_interval ERROR: {e}")

            # GUI thread'de güncelle (lambda ile scope güvenli)
            def _do_update(q, p):
                tray_log(f"UI UPDATE: quick_scan={q}, ping={p}")
                win._quick_scan_in.setText(q)
                win._ping_scan_in.setText(p)
                tray_log(f"UI UPDATE DONE: quick_scan_in.text()={win._quick_scan_in.text()}, ping_scan_in.text()={win._ping_scan_in.text()}")

            QTimer.singleShot(0, lambda q=quick_val, p=ping_val: _do_update(q, p))

        # Thread'de çalıştır (UI block olmasın)
        from threading import Thread
        Thread(target=_load, daemon=True).start()

    def is_dev_running(self) -> bool:
        return self._dev_proc is not None and self._dev_proc.poll() is None

    def toggle_dev_server(self):
        if self.is_dev_running():
            if sys.platform == "win32":
                try:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(self._dev_proc.pid)],
                        capture_output=True, timeout=5,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                except Exception:
                    self._dev_proc.kill()
            else:
                self._dev_proc.terminate()
            try:
                self._dev_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._dev_proc.kill()
            self._dev_proc = None
            tray_log("Dev server durduruldu.")
            self.tray.showMessage("Dev Server", "Dev server durduruldu.", QSystemTrayIcon.MessageIcon.Warning, 2000)
        else:
            frontend_dir = ROOT_DIR / "frontend"
            if not frontend_dir.exists():
                self.tray.showMessage("Dev Server", "frontend/ klasörü bulunamadı!", QSystemTrayIcon.MessageIcon.Critical, 3000)
                return
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            self._dev_proc = subprocess.Popen(
                ["npm.cmd" if sys.platform == "win32" else "npm", "run", "dev"],
                cwd=str(frontend_dir),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                creationflags=flags,
            )
            tray_log(f"Dev server başlatıldı — PID {self._dev_proc.pid}")
            self.tray.showMessage("Dev Server", "Vite dev server başlatıldı → http://localhost:5173", QSystemTrayIcon.MessageIcon.Information, 3000)
            # 1.5 saniye sonra tarayıcıyı aç
            QTimer.singleShot(1500, lambda: __import__('webbrowser').open("http://localhost:5173"))
        self.win.refresh()

    def _check_proc(self):
        if self._proc and self._proc.poll() is not None:
            exit_code = self._proc.returncode
            self._proc = None

            try:
                ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if self._log_file:
                    self._log_file.write(
                        f"\n[{ts}] !!! Servis kapandı (exit: {exit_code}) !!!\n"
                    )
            except Exception:
                pass
            self._close_log_file()

            tray_log(f"!!! Servis beklenmedik şekilde kapandı — exit code: {exit_code}")

            self.tray.setIcon(self._ico_err)
            self.tray.setToolTip("Network Monitor ✕ Hata / Kapandı")
            self.tray.showMessage(
                "Network Monitor",
                f"Servis kapandı! (exit: {exit_code})  Detay: backend/log/server.log",
                QSystemTrayIcon.MessageIcon.Critical, 5000,
            )
            self.win.refresh()

    def _cleanup(self):
        """Uygulama kapanırken tüm process ağaçlarını temizle"""
        def _kill_tree(proc):
            if proc is None:
                return
            if sys.platform == "win32":
                try:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                        capture_output=True, timeout=5,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            else:
                try:
                    proc.terminate()
                    proc.wait(timeout=3)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass

        try:
            tray_log("Cleanup: Process ağaçları kapatılıyor...")
            _kill_tree(self._dev_proc)
            _kill_tree(self._proc)
            kill_port(self.cfg["port"])
            self._proc = None
            self._dev_proc = None
            self._close_log_file()
            tray_log("Cleanup: Tamamlandı.")
        except Exception as e:
            tray_log(f"Cleanup hatası: {e}")

    def clear_logs(self):
        """server.log ve tray.log dosyalarını sıfırla.

        Windows: subprocess uvicorn server.log'a yazarken parent dosyayı
        truncate edemez (file lock). Bu yüzden:
          - Server çalışıyorsa: stop → truncate → start (tek tray bildirimi)
          - Server kapalıysa: doğrudan truncate
        tray.log her durumda hemen temizlenebilir (parent kendisi yazıyor).
        """
        was_running = self.is_running()
        truncated = []
        failed = []

        # 1) Server çalışıyorsa kapat (handle'lar serbest kalsın)
        if was_running:
            self.stop_server()  # process.wait() içerir, handle'lar kapanır

        # 2) Dosyaları sıfırla
        for name, path in (("tray.log", TRAY_LOG), ("server.log", SERVER_LOG)):
            try:
                path.write_text("", encoding="utf-8")
                truncated.append(name)
            except Exception as e:
                failed.append(f"{name} ({e})")

        # 3) Server yine çalışıyor olmalıysa yeniden başlat
        if was_running:
            self.start_server()

        # 4) Tek toparlayıcı bildirim (tray_log dosyayı yeniden oluşturacak)
        summary = f"Temizlendi: {', '.join(truncated)}" if truncated else "Temizlenecek dosya yok"
        if failed:
            summary += f" — Hatalı: {', '.join(failed)}"
        tray_log(summary)
        try:
            self.tray.showMessage(
                "Log Temizleme",
                summary,
                QSystemTrayIcon.MessageIcon.Warning if failed else QSystemTrayIcon.MessageIcon.Information,
                2500,
            )
        except Exception:
            pass

    def _write_setting_db(self, key: str, value: str):
        """Backend kapalıyken settings tablosunu doğrudan SQLite üzerinden günceller.
        DB tek source of truth; backend açıkken HTTP API kullanılır."""
        import sqlite3
        db_path = BACKEND_DIR / "network_monitor.db"
        if not db_path.exists():
            tray_log(f"DB bulunamadı: {db_path}")
            return
        try:
            conn = sqlite3.connect(str(db_path), timeout=5)
            try:
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (key, value),
                )
                conn.commit()
            finally:
                conn.close()
            tray_log(f"DB ayar güncellendi: {key}={value}")
        except Exception as e:
            tray_log(f"DB ayar yazma hatası: {e}")

    def _quit(self):
        tray_log("Uygulama kapatıldı.")
        self.stop_server()
        self.tray.hide()
        self.qt.quit()

    def run(self):
        sys.exit(self.qt.exec())


if __name__ == "__main__":
    TrayApp().run()
