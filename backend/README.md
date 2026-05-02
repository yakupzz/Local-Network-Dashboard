# Grandmedical Hastanesi Network Monitor Dashboard — Backend

FastAPI + SQLite real-time network device monitoring with multi-method detection (ICMP → TCP → ARP) and WebSocket push updates.

## Quick Start

### Windows (with Tray App)

```bash
run_backend.bat
```

Creates `.venv`, installs deps, launches tray app + uvicorn

### Windows (Console, for debugging)

```bash
.venv\Scripts\python.exe tray_app.py
```

### Manual Backend Only

```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 5770
```

### Linux/Mac

```bash
python3 -m venv .venv
source .venv/bin/activate  # or: .\.venv\Scripts\activate.bat (Windows)
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 5770
```

## Configuration

### Environment Variables (`backend/.env`)

`.env` is **only for deployment-level config** — runtime knobs (scan intervals,
TCP ports, debug mode) live in the `settings` table.

```bash
# Optional — defaults to backend/network_monitor.db
DATABASE_URL=sqlite:///D:/Projeler/dashboard/backend/network_monitor.db

# Optional — comma-separated allowlist; falls back to LAN private-IP regex
CORS_ORIGINS=http://localhost:5173,http://192.168.1.10:5770

# Optional — enables bearer-token auth on /api/* and /ws when set
API_TOKEN=<random-32-char-string>

# Optional — when "1", runs `alembic upgrade head` on startup
AUTO_MIGRATE=1
```

### Database Settings (DB is single source of truth)

Configured in DB `settings` table — read/written via `/api/settings/{key}`,
no `.env` round-trip:

- `ping_interval` — Full scan interval (seconds, default 300)
- `quick_scan_interval` — Fast scan interval (seconds, default 60)
- `log_cleanup_days` — Delete raw logs older than (days, default 30); aggregates retained
- `tcp_scan_ports` — Ports to scan if ICMP fails (comma-separated, default `80,443,22,3389,445,135,8080,8443`)
- `debug_mode` — `true`/`false`, toggles backend log level

## Architecture

### Data Flow

```text
PingService.ping_device()
    ├─ ICMP (ping -n 1 -w 2000)
    ├─ TCP fallback (ports from tcp_scan_ports, sequential)
    ├─ ARP probe (UDP → forces OS ARP broadcast → arp -a)
    └─ MAC/hostname/vendor resolution (DNS, nbtstat, OUI lookup)
         ↓
    scheduler.py updates Device + PingLog in SQLite
         ↓
    ws.py broadcast → WebSocket clients
```

### Scheduler Jobs (APScheduler)

| Job | Interval | Purpose |
| --- | --- | --- |
| `ping_all_devices` | 300s (configurable) | Full scan: ICMP+TCP+ARP, MAC, hostname, vendor, port scan |
| **`quick_scan_cycle`** | **60s (configurable)** **NEW** | **Fast scan: Group-based ICMP/TCP/ARP, detect offline <1min** |
| `cleanup_old_logs` | 03:00 daily (cron) | Delete PingLog records older than `log_cleanup_days` |
| `backup_database` | 02:00 daily (cron) | SQLite `.backup()` API → `backend/backups/backup_YYYY-MM-DD.db` |

**Quick Scan (NEW 2026-04-17):**

- Groups devices by `detection_method` (ICMP, TCP, ARP, Unknown)
- ICMP group: 2s timeout, Semaphore(50) for concurrency
- TCP group: Single port connect (0.5s timeout)
- ARP group: Single broadcast UDP → 300ms wait → parse `arp -a` once
- Updates `is_online` + `last_ping_time` only if status changed
- WebSocket broadcast on change

### Device Detection

**Detection Methods:**

1. **ICMP** — `ping -n 1 -w 2000` (Windows) / `ping -c 1 -W 2` (Linux)
   - Success = "TTL=" or "ms" in output (excludes Turkish/English timeout strings)
   - Fastest, most reliable on open networks

2. **TCP Fallback** — If ICMP fails
   - Tries ports from `tcp_scan_ports` sequentially (default: 80, 443, 22, 3389, 445, 135, 8080, 8443)
   - 1s timeout per port, first open = detected
   - Format: `detection_method = "TCP (port 443)"`

3. **ARP Probe** — If ICMP+TCP fail
   - Sends UDP datagram to force OS ARP broadcast
   - Waits 200ms (full scan) or 300ms (quick scan)
   - Reads `arp -a` → parses MAC
   - Detects devices blocking ICMP/TCP (Layer 2 method)

4. **MAC Address** — From ARP cache after successful probe

5. **Hostname** — `socket.gethostbyaddr()` (DNS) or `nbtstat -A` (NetBIOS)

6. **Vendor** — `mac-vendor-lookup` (offline OUI database)

7. **Open Ports** — If ICMP succeeded, scan all ports in parallel; else first open port only

### Database

**Tables:**

- `devices` — Device list (name, IP, category, location, is_online, detection_method, mac_address, hostname, vendor, open_ports, image_filename)
- `ping_logs` — History (device_id, timestamp, success, response_time) — raw, retained per `log_cleanup_days`
- `ping_logs_hourly` — Hourly rollup (device_id, hour, total, success_count, avg_response_time) — uptime queries hit this
- `settings` — Configuration (key, value)
- `categories` — Device categories (id, name, icon, image_filename)
- `alembic_version` — Migration tracker (managed by Alembic)

**Concurrency:** SQLite is opened in WAL mode (`journal_mode=WAL`,
`busy_timeout=5000`), so dashboard reads don't block scheduler writes.

**Migrations (Alembic):** schema changes live in [`alembic/versions/`](alembic/versions/).
Run `alembic upgrade head` to apply, or set `AUTO_MIGRATE=1` for startup auto-run.

**Icon Storage:**

- Category PNG icons: `backend/static/categories/` (filename in `categories.image_filename`)
- Device custom icons: Same folder, filename pattern `device_{id}_{uuid}.ext` (stored in `devices.image_filename`)

**Backups:**

- Location: `backend/backups/backup_YYYY-MM-DD.db`
- Frequency: Daily at 02:00 via APScheduler cron job
- Method: SQLite `.backup()` API (safe, no locking)
- Retention: Last 7 days (auto-delete older)
- Purpose: Data loss protection (incident: 78 devices lost 2026-04-16)

## API Endpoints

> **Auth (method-aware):** if `API_TOKEN` is set in `.env`, write requests
> (POST/PUT/PATCH/DELETE) require `Authorization: Bearer <token>`. Read
> requests (GET/HEAD/OPTIONS) and the WebSocket stream stay open on the LAN.
> Frontend prompts for the token only when a write fails with 401.

### Devices CRUD

```http
GET    /api/devices/                 # List all
POST   /api/devices/                 # Add device (triggers immediate ping)
GET    /api/devices/{id}             # Get one
PUT    /api/devices/{id}             # Update
DELETE /api/devices/{id}             # Delete
GET    /api/devices/{id}/image?t=X   # Get custom icon (cache-busting param)
POST   /api/devices/{id}/image       # Upload custom icon (multipart/form-data)
```

### Import/Export

```http
GET    /api/devices/import/template-excel    # Download XLSX template (with dropdowns)
POST   /api/devices/import/csv               # Upload CSV/XLSX (auto-triggers bulk scan)
```

### Device Status

```http
GET    /api/ping/stats/summary               # {total_devices, online_devices, offline_devices, last_scan_time}
GET    /api/ping/uptime                      # {device_id: {uptime_24h, uptime_7d}, ...}
GET    /api/ping/history/{device_id}         # [PingLog, ...] last 100 records
GET    /api/dashboard/trend                  # [{time, online, offline}, ...] 24h trend
GET    /api/ping/{id}                        # Trigger immediate ping for device
```

### Settings

```http
GET    /api/settings/{key}                   # Get setting value
PUT    /api/settings/{key}                   # Update setting
GET    /api/settings/config/connection       # {backend_port, ws_url} for frontend config
```

### Categories

```http
GET    /api/categories/                      # List all
POST   /api/categories/                      # Add
PUT    /api/categories/{id}                  # Update
DELETE /api/categories/{id}                  # Delete
GET    /api/categories/{id}/image            # Get icon
POST   /api/categories/{id}/image            # Upload icon
```

### WebSocket

```text
WS     /ws                                   # Real-time updates
  Events:
    {type: "ping_complete"}                  # Full scan finished
    {type: "device_online", device_id, name, ip}
    {type: "device_offline", device_id, name, ip}
```

## Key Files

| File | Role |
| ---- | ---- |
| `tray_app.py` | PySide6 tray app; manages uvicorn subprocess, logs to `backend/log/server.log` |
| `app/main.py` | FastAPI app entry; Windows event loop policy, scheduler startup, optional auth wiring |
| `app/database.py` | SQLAlchemy engine + WAL/PRAGMA event listener |
| `app/models.py` | SQLAlchemy ORM: Device, PingLog, PingLogHourly, Setting, Category |
| `app/auth.py` | Optional `API_TOKEN`-driven bearer auth (REST + WebSocket) |
| `app/services/network_scanner.py` | Device detection logic: `scan_device()`, `arp_broadcast_scan()` |
| `app/services/ping_service.py` | ICMP ping: `ping_device()`, `scan_all()`, `ping_icmp_batch()`, `ping_tcp_port()` |
| `app/services/scheduler.py` | APScheduler jobs: `ping_all_devices()`, `quick_scan_cycle()`, `backup_database()`, `cleanup_old_logs()`, `rollup_hourly()` |
| `app/routers/devices.py` | Device CRUD + import/export + image upload (magic-byte validated) |
| `app/routers/categories.py` | Category CRUD + icon upload |
| `app/routers/ping.py` | Status endpoints: stats, history, trend, **uptime (reads `ping_logs_hourly`)** |
| `app/routers/settings.py` | Settings CRUD |
| `app/ws.py` | WebSocket `ConnectionManager` singleton, `broadcast()` |
| `alembic/` | Schema migrations (env.py, versions/) |
| `tests/` | pytest suite — fixtures, settings/CSV/grouping tests |
| `scripts/backfill_hourly.py` | One-shot backfill of `ping_logs_hourly` from raw logs |

## Common Commands

### Development

```bash
# Activate venv
.venv\Scripts\activate.bat

# Install/update deps
pip install -r requirements.txt

# Run with auto-reload
python -m uvicorn app.main:app --reload --port 5770

# Run tests (in-memory SQLite, no real network)
python -m pytest tests/ -v

# Generate a new migration after model change
../.venv/Scripts/alembic revision --autogenerate -m "describe change"

# Apply migrations
../.venv/Scripts/alembic upgrade head

# Backfill hourly aggregates from raw ping_logs (one-shot)
python -m scripts.backfill_hourly
```

### Database CLI

```bash
# SQLite CLI (explore DB)
sqlite3 network_monitor.db
  sqlite> .tables
  sqlite> SELECT COUNT(*) FROM devices;
  sqlite> .quit

# Clear DB (dev only)
rm network_monitor.db  # Auto-recreates on next startup
```

### Logs

```bash
# Backend logs (from tray app)
backend/log/server.log

# Tail logs (Windows)
Get-Content backend/log/server.log -Wait

# Tail logs (Linux)
tail -f backend/log/server.log
```

## Dependencies

```text
fastapi              # Web framework
uvicorn[standard]    # ASGI server (standard = WebSocket support)
sqlalchemy           # ORM
pydantic             # Request validation
apscheduler          # Job scheduling
python-multipart     # File upload
websockets           # WebSocket protocol
PySide6>=6.6.0       # Tray app GUI
mac-vendor-lookup    # Offline OUI database
openpyxl             # XLSX import/export
alembic              # Schema migrations
pytest, pytest-asyncio, httpx   # Test deps
```

## Windows-Specific Notes

### Event Loop Policy

**CRITICAL:** `asyncio.set_event_loop_policy(WindowsProactorEventLoopPolicy())` at top of `main.py`

- Required for `subprocess.run()` in async context (ping)
- Default `SelectorEventLoopPolicy` doesn't support pipes on Windows

### Icons in Tray App

- `QPixmap`/`QIcon` must be created **AFTER** `QApplication(sys.argv)`
- Creating at module level crashes silently under `pythonw.exe`
- See `tray_app.py` for safe ordering

### Port Management

- `kill_port(port)` called before `start_server()`
- Clears leftover processes (`[WinError 10048]` — "Address already in use")

### Process Management

```bash
# Check if backend running
curl http://localhost:5770/api/ping/stats/summary

# Kill process on port 5770
netstat -ano | find "5770"          # Find PID
taskkill /PID <PID> /F

# Kill all Python processes
taskkill /F /IM python.exe
```

## Timezone Handling

- **SQLite stores UTC timestamps** (no timezone metadata)
- **Use `now_tz()` helper** in code: `datetime.now(timezone.utc).astimezone()`
  - Returns local timezone-aware datetime (GMT+3 for Turkey)
  - Used for scan times, cleanup cutoffs, backup naming
- **Frontend adds "Z" suffix** before parsing: `new Date(timestamp + 'Z').toLocaleString('tr-TR')`
- **Why:** Consistent timestamps across system, SQLite compatibility

## Troubleshooting

### Backend Won't Start

```bash
# Check port in use
netstat -ano | find "5770"

# Kill process
taskkill /PID <PID> /F

# Try different port
python -m uvicorn app.main:app --port 6000
```

### Database Locked

- Multiple processes accessing SQLite simultaneously
- Solution: Ensure only one backend instance running (`tasklist | find "python"`)

### Devices Not Pinging

1. Check `ping_interval` in DB: `SELECT value FROM settings WHERE key='ping_interval'`
2. Check scheduler running: Backend logs should show "Scheduler started"
3. Manual test: `GET /api/ping/1` (trigger ping for device ID 1)
4. Check network connectivity: `ping 192.168.1.1` (test device IP)

### WebSocket Not Broadcasting

1. Check backend logs for errors
2. Verify `uvicorn[standard]` installed (not plain `uvicorn`)
3. Check firewall allowing localhost:5770
4. Frontend console: Check WS connection URL is correct

## Recent Updates (2026-04-17)

✅ **Quick Scan Optimization** — 60s interval, group-based ICMP/TCP/ARP detection, <1min offline detection  
✅ **Device Delete Confirmation** — Custom modal (frontend)  
✅ **Bulk Delete** — Checkbox multi-select (frontend)  
✅ **Excel Export** — Same template format as import (frontend)  

See CLAUDE.md for detailed architecture notes.

## Performance Notes

**Bottlenecks:**

- ICMP ping timeout (2s) — unavoidable, Layer 3
- TCP port scan (8 ports × 1s) — sequential, slow for offline devices
- ARP broadcast parse — O(1) once, parallelized in quick scan

**Optimizations:**

- Quick scan (60s): ICMP/TCP/ARP groups, Semaphore(50), detects offline <1min
- Full scan (300s): All details (MAC, hostname, vendor, ports) for completeness
- DB: Indexed on device IP + detection_method for fast lookups
- WebSocket: Broadcast only on status change (reduces noise)

## License & Credits

Grandmedical Hastanesi Network Monitoring System  
Built with FastAPI, React, TypeScript, SQLite
