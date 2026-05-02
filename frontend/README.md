# Grandmedical Hastanesi Network Monitor Dashboard — Frontend

React + TypeScript + Vite frontend for real-time network device monitoring with WebSocket updates.

## Quick Start

### Development Server
```bash
npm install
npm run dev
```
→ `http://localhost:5173`

### Build
```bash
npm run build
```

## Configuration

### Backend Port (Dynamic)
Edit `frontend/.env.local`:
```bash
VITE_BACKEND_PORT=5770  # Change if backend on different port
```
Frontend auto-reloads — no cache issues, no restart needed.

## Architecture

### Single Monolithic Component (`src/App.tsx`)
- **~1800 lines**, all state and UI in one component
- **Why:** Simpler debugging, faster iteration, avoids Vite module resolution issues
- **State:** 40+ `useState` hooks (device management, modals, filters, selections)
- **Inline components:** Sparkline (SVG mini chart), TrendChart (24h area chart), Toast (notification), StatCards

### Styling
- **No Tailwind** — inline CSS throughout
- **Dark mode:** Single `darkMode` boolean (`D` alias) controls all colors
- **Color tokens:** `bg`, `surface`, `border`, `textMain`, `textMuted`
- **Responsive:** Inline styles + conditional rendering per view mode

### State Management
- `useState` for local state (forms, modals, filters)
- `useRef` for stable references (WebSocket, DOM refs, backend state)
- `useCallback` for event handlers
- No Redux/Context — unnecessary for this scope

## Key Features

### Device Management
- **List/Card/XLarge view modes** with configurable columns
- **Search & filter** by status (online/offline), category, location
- **Device custom icons** (per-device PNG upload)
- **Expandable rows** showing detection_method, hostname, MAC, vendor, open ports

### Bulk Operations (NEW 2026-04-17)
- **Multi-select:** Checkboxes in list view, "Select All" in header
- **Bulk delete:** "X devices selected" → confirm modal → parallel DELETE
- **Filtering clears selection** (prevents accidental bulk ops on filtered view)

### Device Deletion (NEW 2026-04-17)
- **Custom confirmation modal** (dark mode compatible, UI pattern)
- **Single delete:** Per-row "Sil" button
- **Bulk delete:** Selected devices → confirm → delete all

### Data Import/Export (NEW 2026-04-17)
- **Excel export:** Same template format as import (easy round-trip)
  - Columns: İsim, IP Adresi, Kategori, Konum, Durum, Son Yanıt (ms)
  - Header: Blue background, white bold text, centered
- **Excel/CSV import:** Template from backend → populate → import
  - Supports Turkish (İsim) and English (name) headers
  - Duplicate IP detection (skipped, not overwritten)
  - Auto-triggers bulk scan after import

### Real-Time Updates
- **WebSocket:** Primary push for device status changes
- **10s polling fallback** if WS unavailable
- **2s retry on startup** until first successful backend fetch
- **Device online/offline events** broadcast immediately

### Uptime Tracking
- **24h trend chart:** Online/offline device counts over time
- **Device uptime:** 24h and 7d percentages per device
- **Sparklines:** Mini response time trends in list view

## WebSocket Events

Backend broadcasts via `/ws`:
- `ping_complete` — Full scan finished, device list refreshed
- `device_online` — Device came online
- `device_offline` — Device went offline

## API Integration

Base URL: `http://127.0.0.1:${VITE_BACKEND_PORT}` (proxied via Vite)

Key endpoints:
- `GET /api/devices/` — List all devices
- `POST /api/devices/` — Add device (triggers immediate ping)
- `PUT /api/devices/{id}` — Update device
- `DELETE /api/devices/{id}` — Delete device
- `GET/PUT /api/devices/{id}/image` — Custom device icon
- `POST /api/devices/import/csv` — Import devices (CSV/XLSX)
- `GET /api/devices/import/template-excel` — Download import template
- `GET /api/categories/` — List categories
- `PUT /api/settings/{key}` — Update setting (ping_interval, tcp_scan_ports, etc.)
- `WS /ws` — WebSocket for real-time updates

## Packages

- **React 18** — UI library
- **TypeScript** — Type safety
- **Vite** — Fast dev server + build
- **XLSX (SheetJS)** — Excel file parsing/generation
- **No Tailwind** — Inline CSS for full control

## Development Notes

### Vite HMR
- Changes to `App.tsx` auto-reload in browser
- `.env.local` changes trigger dev server restart + browser reload
- No manual refresh needed in most cases

### Module Resolution
- Single-file monolith avoids Vite circular dependency issues
- If modularizing: extract in order: types.ts → hooks → components
- See CLAUDE.md for modularization strategy

### Dark Mode
- Preference stored in `localStorage` as `nm_dark` (true/false)
- All inline styles use `D` variable (`darkMode` boolean) for conditional colors
- Toggle in header (🌙/☀️ button)

## Troubleshooting

### White Screen
1. Check browser console (F12) for React errors
2. Verify backend running: `curl http://localhost:5770/api/ping/stats/summary`
3. Check backend port in `.env.local` matches actual backend port
4. Hard refresh: Ctrl+Shift+Delete + Ctrl+Shift+R

### WebSocket Not Connecting
1. Verify backend port in `.env.local`
2. Check backend running on that port
3. Restart frontend: `npm run dev`

### Code Changes Not Appearing
1. Vite HMR should auto-reload — if not, hard refresh browser
2. After `.env.local` changes, dev server auto-restarts
3. If stuck, kill Node: `taskkill /F /IM node.exe` and restart

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run preview   # Preview production build locally
npm run tsc       # TypeScript type check (if available in tsconfig)
```

## Recent Updates (2026-04-17)

✅ **Quick Scan Optimization** — 60s interval for fast offline detection (<1min)  
✅ **Delete Confirmation Modal** — Dark mode compatible, UI pattern  
✅ **Bulk Delete** — Checkbox multi-select, parallel DELETE  
✅ **Excel Export** — Template format for easy import-export workflow

See CLAUDE.md for full details.
