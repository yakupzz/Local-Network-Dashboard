# 📊 Network Monitor Dashboard

**Real-time network device monitoring application** — Scan and track devices (phones, TVs, computers) on your local network with multi-method detection (ICMP → TCP → ARP).

## ✨ Features

- **Multi-Method Device Detection**: ICMP ping → TCP port scan → ARP probe (for firewalled devices)
- **Real-Time Monitoring**: WebSocket-powered live updates, configurable quick scan cycle
- **Scan Interval Display**: Dashboard header shows active Hızlı Tarama & Derin Tarama durations (live, WebSocket-synced)
- **Device Management**: Add, edit, delete devices with custom icons and categories
- **Per-Category Statistics**: Online/offline breakdown via donut charts
- **Smart Scheduling**: Full scan (ping_interval), quick scan (quick_scan_interval), log cleanup, automated backups
- **Excel Import/Export**: Bulk device management with CSV/XLSX support
- **Dark/Light Theme**: Full theme support with persistent preferences
- **Windows Tray App**: Single entry point — starts backend, opens browser, controls scan intervals
- **Optional Bearer-Token Auth**: Set `API_TOKEN` to protect `/api/*` and `/ws`; opt-in so existing LAN setups keep working
- **Alembic Migrations**: Schema changes are versioned, no more ad-hoc `ALTER TABLE`
- **Hourly Aggregate Table**: Uptime queries read pre-rolled `ping_logs_hourly` instead of millions of raw rows

## 🚀 Quick Start

### Prerequisites

- **Windows** (backend uses Windows-specific commands: `ping`, `arp`, `nbtstat`)
- **Python 3.10+** + **Node.js 18+**

### Run (Production Mode)

```bash
# 1. Build frontend once (or after UI changes)
cd frontend && npm run build

# 2. Start everything via tray app
python tray_app.py
# → Backend starts automatically on the port in tray_config.json
# → Browser opens to the dashboard
```

or click system_viewer.bat 

### Run (Development Mode — Hot Reload)

```bash
# 1. Start tray app (starts backend)
python tray_app.py

# 2. In tray window, click "▶ Dev Server Başlat"
# → Vite dev server starts on port 5173 with hot reload
# → Browser opens to localhost:5173 automatically
```

### Manual Backend Only

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 5770
```

### Change Backend Port

Edit `tray_config.json` in the project root:

```json
{ "port": 5770, "dark": true }
```

Or use **Settings → Connection** in the tray app UI.

## 📦 Tech Stack

### Backend

- **Framework**: FastAPI (Python async web framework)
- **Scheduler**: APScheduler (background job scheduling)
- **Database**: SQLite with automated daily backups
- **Detection**: `subprocess` ping, `socket` TCP, `arp -a` ARP probe, `nbtstat` NetBIOS
- **Static Files**: Backend serves `frontend/dist/` — single port, same-origin

### Frontend

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite (fast HMR in dev mode)
- **Styling**: Inline CSS (no Tailwind), dark mode via boolean flag
- **WebSocket**: Real-time device status + settings updates
- **UI**: Custom components (no external UI library)

### Desktop

- **PySide6 tray app** (`tray_app.py`): single entry point, controls backend + optional Vite dev server

## 🏗️ Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                    Network Devices                       │
└─────────────────────────────────────────────────────────┘
                           ↓
                    ┌──────────────┐
                    │ Quick Scan   │ (quick_scan_interval, ICMP/TCP/ARP)
                    │ Full Scan    │ (ping_interval, deep detection)
                    │ Scheduled    │ (APScheduler)
                    └──────────────┘
                           ↓
     ┌─────────────────────┼─────────────────────┐
     ↓                     ↓                     ↓
  ICMP Ping          TCP Fallback         ARP Probe
  (Layer 3)          (Port scan)          (Layer 2)
     ↓                     ↓                     ↓
  ┌─────────────────────────────────────────────┐
  │ Detection: MAC, Hostname, Vendor, Ports     │
  │ Database: devices, ping_logs, settings      │
  └─────────────────────────────────────────────┘
                           ↓
     ┌─────────────────────┼─────────────────────┐
     ↓                     ↓                     ↓
  WebSocket          REST API              Tray App
  (Real-time)        (CRUD ops)            (Settings)
     ↓                     ↓                     ↓
  ┌──────────────────────────────────────────────┐
  │            Frontend (React)                  │
  │  Dashboard, Device List, Settings, Charts    │
  │  Served by backend (same-origin, one port)   │
  └──────────────────────────────────────────────┘
```

### Data Flow

1. **Scheduler** (APScheduler) triggers scan every `quick_scan_interval`s (quick) or `ping_interval`s (full)
2. **Ping Service** runs multi-method detection: ICMP → TCP → ARP
3. **Network Scanner** collects MAC, hostname, vendor, open ports
4. **Database** stores results in `devices` + `ping_logs` tables (indexed on device_id + timestamp)
5. **WebSocket** broadcasts changes to all connected clients (device status + settings updates)
6. **Frontend** updates UI in real-time — no page refresh needed

## 📂 Project Structure

```text
dashboard/
├── tray_app.py                 # Single entry point (PySide6 tray + backend launcher)
├── tray_config.json            # Port, dark mode preference
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI entry point + static file serving
│   │   ├── database.py         # SQLite setup + WAL PRAGMA
│   │   ├── models.py           # SQLAlchemy ORM models (incl. PingLogHourly)
│   │   ├── schemas.py          # Pydantic request/response schemas
│   │   ├── auth.py             # Optional bearer-token auth (API_TOKEN env)
│   │   ├── routers/            # API endpoints (devices, ping, settings, categories, dashboard)
│   │   ├── services/
│   │   │   ├── ping_service.py     # ICMP ping
│   │   │   ├── network_scanner.py  # TCP, ARP, DNS, Vendor detection
│   │   │   └── scheduler.py        # APScheduler jobs (scan, backup, rollup, cleanup)
│   │   └── ws.py               # WebSocket connection manager
│   ├── alembic/                # Schema migrations (versions/, env.py)
│   ├── alembic.ini             # Alembic config
│   ├── tests/                  # pytest suite (in-memory SQLite)
│   ├── scripts/
│   │   └── backfill_hourly.py  # One-shot: fill ping_logs_hourly from raw logs
│   ├── backups/                # Daily DB backups (auto-rotation, 7 days)
│   ├── log/                    # server.log + tray.log
│   ├── requirements.txt
│   └── .env                    # Deployment env (DATABASE_URL, API_TOKEN, CORS_ORIGINS, AUTO_MIGRATE)
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Main component (state, fetch coordination)
│   │   ├── components/         # SettingsModal, DeviceFormModal, HistoryModal, FilterBar, …
│   │   ├── hooks/              # useDeviceFilters, useCategoryStats, useWebSocket
│   │   ├── api/
│   │   │   └── authFetch.ts    # Global fetch interceptor (injects Authorization header)
│   │   └── index.css
│   ├── dist/                   # Built frontend (served by backend in production)
│   ├── vite.config.ts
│   └── package.json
│
└── README.md
```

## 🔍 Device Discovery (How Detection Works)

### Detection Methods (Fallback Chain)

1. **ICMP Ping** (Layer 3) — Fast, 2s timeout
   - Success: Device is online
   - Failure: Try next method

2. **TCP Port Scan** (Firewall bypass) — Ports: 80, 443, 22, 3389, 445, 135, 8080, 8443
   - If any port open: Device detected
   - Failure: Try next method

3. **ARP Probe** (Layer 2) — Unreachable by firewalls
   - Broadcast: "Who has this IP?"
   - Success: MAC address obtained
   - Works only on local subnet

4. **DNS/NetBIOS Lookup** — Get hostname
5. **OUI Database** — Get vendor name from MAC address
6. **Open Ports** — Parallel scan if ICMP succeeded

## ⚙️ Configuration

### Backend `.env` (deployment / runtime config only)

The `.env` file is **only for deployment-level configuration** — runtime
behaviour like scan intervals lives in the database (see "Database Settings"
below). Both reading and writing of these knobs go through the `settings`
table; no `.env` round-trip on save.

```bash
# Optional — defaults to backend/network_monitor.db
DATABASE_URL=sqlite:///./network_monitor.db

# Optional — comma-separated allowlist; leave unset to fall back to LAN regex
CORS_ORIGINS=http://localhost:5173,http://192.168.1.10:8000

# Optional — enables bearer-token auth for /api/* and /ws when set
API_TOKEN=<random-32-char-string>

# Optional — when "1", runs `alembic upgrade head` on startup
AUTO_MIGRATE=1
```

### Database Settings (via UI or Tray — DB is single source of truth)

| Key | Default | Description |
| --- | --- | --- |
| `ping_interval` | 300s | Full/deep scan frequency |
| `quick_scan_interval` | 60s | Fast online/offline scan frequency |
| `tcp_scan_ports` | 80,443,22,… | TCP fallback ports |
| `log_cleanup_days` | 30 | Auto-delete old raw ping logs (aggregates remain) |
| `debug_mode` | false | Toggles backend log level |

Settings updates are broadcast via WebSocket — the dashboard header reflects
current scan intervals in real time. Tray app writes directly to the SQLite
`settings` table when the backend is offline.

## 📊 Database

### Tables

| Table | Purpose |
| --- | --- |
| `devices` | Device info: IP, name, category, online status, MAC, hostname, vendor, ports |
| `ping_logs` | Historical ping results: timestamp, success, response_time |
| `ping_logs_hourly` | Saatlik özet — `device_id × hour` bazında total / success_count / avg_rt |
| `settings` | Key-value store: ping intervals, TCP ports, cleanup days, debug mode |
| `categories` | Device categories: name, emoji, custom PNG icon |

### Indexes

```sql
CREATE INDEX idx_ping_logs_device_ts ON ping_logs (device_id, timestamp);
CREATE UNIQUE INDEX idx_ping_hourly_device_hour ON ping_logs_hourly (device_id, hour);
CREATE INDEX idx_ping_hourly_hour ON ping_logs_hourly (hour);
```

Aggregate index speeds up uptime queries from O(rows) to O(buckets) — e.g.
24 rows per device for 24h uptime instead of thousands of raw entries.

### Migrations (Alembic)

Schema lives in [`backend/alembic/versions/`](backend/alembic/versions/).

```bash
cd backend
../.venv/Scripts/alembic current             # which revision is the DB at
../.venv/Scripts/alembic upgrade head        # apply pending migrations
../.venv/Scripts/alembic revision --autogenerate -m "describe change"
```

Set `AUTO_MIGRATE=1` in `backend/.env` to run `upgrade head` on startup.

### Aggregate Rollup

A scheduled job runs hourly (cron, minute=5) and rolls up the previous
hour's raw `ping_logs` into `ping_logs_hourly`. The uptime endpoint reads
aggregates for closed hours and only scans the current hour from raw logs,
so you can keep `log_cleanup_days` short without losing uptime history.

To backfill aggregates from existing raw logs (one-shot):

```bash
cd backend
../.venv/Scripts/python -m scripts.backfill_hourly
```

### Backups

- **Frequency**: Daily at 02:00
- **Location**: `backend/backups/backup_YYYY-MM-DD.db`
- **Retention**: Last 7 days (auto-rotation)
- **Method**: SQLite `.backup()` API (safe online backup, no locking)
- **Concurrency**: SQLite WAL mode is enabled, so reads (dashboard queries)
  never block scheduler writes (ping logs)

## 🔧 Common Tasks

### Add a Device

1. Click **+ Ekle** in the top bar
2. Fill in: Name, IP, Category, Location (optional)
3. Click **Kaydet** — Device is pinged immediately

### Bulk Import Devices

1. Click **📤 İçe Aktar**
2. Download template → Fill rows → Upload
3. Auto-scan triggered on import

### Change Scan Speed

- **Via UI**: Settings modal → scan interval fields
- **Via Tray App**: Right-click tray icon → open tray window → scan interval sliders (works even when browser is closed)

### View Device History

- Click **Geçmiş** on any device row
- Loads last 72h of ping logs for that device only
- Filter by time range: Son An / 5dk / 15dk / 1sa / 6sa / 3gün

## 🔐 Authentication (Method-Aware)

Read endpoints are open on the LAN, write endpoints require a bearer token.
This matches the typical "monitor freely, edit with credentials" usage on a
trusted local network.

### Behaviour

| Method / Endpoint | When `API_TOKEN` is set | When `API_TOKEN` is unset |
| --- | --- | --- |
| `GET` / `HEAD` / `OPTIONS` (read) | open | open |
| `POST /api/ping/{id}`, `POST /api/ping/all/scan` (status check) | open | open |
| `POST` / `PUT` / `PATCH` / `DELETE` (other writes) | bearer token required | open |
| WebSocket `/ws` (read-only event stream) | open | open |

> Ping actions on existing devices stay open — they're a status check that
> only produces a `PingLog` entry, not a state change. Adding/editing/deleting
> devices, settings, categories, imports, and history cleanup remain protected.

### Enable

1. Set a strong token in `backend/.env`:

   ```bash
   API_TOKEN=<paste-random-32-char-string>
   ```

   Generate one with: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

2. Restart the backend. The dashboard loads without any prompt — only when
   the user tries to add/edit/delete a device or change a setting does the
   browser ask for the token (one-time prompt, persisted in localStorage).

3. Tray app reads the token from `backend/.env` automatically, so its
   settings updates keep working without manual config.

### Disable

Comment out `API_TOKEN` in `backend/.env` and restart the backend. Writes
become open again.

## 🧪 Tests

```bash
cd backend
../.venv/Scripts/python -m pytest tests/ -v
```

Covers settings GET/PUT roundtrip, CSV import (Turkish headers, duplicate
IPs, invalid input), and `quick_scan_cycle` group splitting (ICMP / TCP-with-port
/ ARP / unknown). In-memory SQLite per test, no real network calls.

## 🛠️ Troubleshooting

### White Screen / No Data

1. Check backend is running (tray app indicator)
2. Verify browser console (F12) for errors
3. Hard refresh: `Ctrl+Shift+R`

### Backend Not Stopping on Quit

The tray app uses `taskkill /F /T /PID` to kill the entire uvicorn process tree (including workers). If processes remain:

```bash
taskkill /F /IM python.exe
taskkill /F /IM node.exe
```

### Port Already in Use

```bash
netstat -ano | find "5770"
taskkill /PID <PID> /F
```

### Database Locked

- Ensure only one backend instance running
- Check: `tasklist | find "python"`

## 📝 Notes

- **Backend runs as Windows PySide6 tray app** — Uses Windows-specific commands (`ping`, `arp`, `nbtstat`)
- **Linux/Mac** — Not supported (would need cross-platform ping/ARP)
- **Single backend instance** — SQLite doesn't support concurrent writes
- **Same-origin** — Frontend served by backend; no CORS, no hardcoded URLs in React
- **WebSocket** — All real-time updates (device status, settings changes) go through a single WS connection

## 📚 Further Reading

- [DEVICE_DISCOVERY.md](.claude/DEVICE_DISCOVERY.md) — Detailed multi-method detection flowchart
- [PROJECT_DOCUMENTATION.md](.claude/PROJECT_DOCUMENTATION.md) — Full architecture & patterns

---

**Last Updated**: 2026-05-02
**Status**: ✅ Fully Functional
