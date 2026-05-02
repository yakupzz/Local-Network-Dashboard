import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useCategoryStats } from './hooks/useCategoryStats';
import { useDeviceFilters } from './hooks/useDeviceFilters';
import { useWebSocket, buildWebSocketUrl } from './hooks/useWebSocket';
import { AUTH_REQUIRED_EVENT, type AuthRequiredDetail } from './api/authFetch';
import { useToast } from './hooks/useToast';
import { useDevices } from './hooks/useDevices';
import { IconGridView, DeviceListView } from './components/DeviceViews';
import { StatCards } from './components/StatCards';
import { CategoryStats } from './components/CategoryStats';
import { CategoryPieCharts } from './components/CategoryPieCharts';
import { HistoryModal } from './components/HistoryModal';
import { SettingsModal } from './components/SettingsModal';
import { DeviceFormModal } from './components/DeviceFormModal';
import { FilterBar } from './components/FilterBar';

// --- Tipler ---
type ViewMode = 'list' | 'large' | 'xlarge' | 'medium' | 'small';
interface Device {
  id: number
  name: string
  ip_address: string
  device_type: string
  is_online: boolean
  last_response_time?: number
  location?: string
  hostname?: string
  vendor?: string
  detection_method?: string
  open_ports?: string
  mac_address?: string
  image_filename?: string
  updated_at?: string
  last_ping_time?: string
  created_at?: string
}
interface Category { id: string; name: string; icon: string; image_filename?: string; updated_at?: string; }
interface UptimeInfo { uptime_24h: number | null; uptime_7d: number | null; }

// --- Global CSS ---
const buildStyles = (dark: boolean) => `
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
  @keyframes pulse-fast { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.2; transform: scale(0.7); } }
  .pulse-dot { animation: pulse 1.5s ease-in-out infinite; }
  .pulse-dot-fast { animation: pulse-fast 0.6s ease-in-out infinite; }
  @keyframes slideInUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  .toast-notification {
    animation: slideInUp 0.3s ease-out; position: fixed; bottom: 30px; right: 30px;
    background: #10b981; color: white; padding: 14px 28px; border-radius: 12px;
    box-shadow: 0 10px 25px rgba(16,185,129,0.25); z-index: 5000; font-weight: 600;
    display: flex; align-items: center; gap: 12px;
  }
  .toast-error { background: #ef4444; box-shadow: 0 10px 25px rgba(239,68,68,0.25); }
  .view-btn { padding: 7px 10px; border-radius: 8px; border: 1px solid ${dark ? '#374151' : '#e5e7eb'}; background: ${dark ? '#1f2937' : 'white'}; cursor: pointer; font-size: 16px; transition: all 0.15s; color: ${dark ? '#9ca3af' : '#6b7280'}; }
  .view-btn:hover { background: ${dark ? '#374151' : '#f3f4f6'}; }
  .view-btn.active { background: #2563eb; border-color: #2563eb; color: white; }
  .device-card { transition: all 0.2s ease; }
  .device-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; }
  .search-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  .sort-th { cursor: pointer; user-select: none; }
  .sort-th:hover { background: ${dark ? '#374151' : '#f3f4f6'}; }
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: ${dark ? '#1f2937' : '#f1f5f9'}; }
  ::-webkit-scrollbar-thumb { background: ${dark ? '#4b5563' : '#cbd5e1'}; border-radius: 3px; }
`;

function App() {
  // --- State ---
  const { showToast } = useToast();
  const {
    devices, setDevices,
    stats,
    isBackendOnline,
    offlineAlerts, setOfflineAlerts,
    backendReadyRef,
    refresh: refreshDevices,
  } = useDevices({
    onDeviceOffline: (d) => showToast(`⚠️ ${d.name} çevrimdışı oldu!`, true),
  });
  const [scanning, setScanning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('large');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('nm_dark') === 'true');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const [showSettings, setShowSettings] = useState(false);
  const [historyRetentionDays, setHistoryRetentionDays] = useState(30);
  const [quickScanInterval, setQuickScanInterval] = useState<number>(60);
  const [pingInterval, setPingInterval] = useState<number>(300);
  const [tcpPorts, setTcpPorts] = useState<number[]>([80, 443, 22, 3389, 445, 135, 8080, 8443]);
  const [newPortInput, setNewPortInput] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);

  const [sortField, setSortField] = useState<'name' | 'ip_address' | 'device_type' | null>('device_type');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    categoryStats: true,
    categoryPie: true,
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const DEFAULT_TCP_PORTS = [80, 443, 22, 3389, 445, 135, 8080, 8443];

  const COLUMNS = [
    { key: 'status',   label: 'Durum' },
    { key: 'device',   label: 'Cihaz Bilgisi' },
    { key: 'type',     label: 'Tür' },
    { key: 'ip',       label: 'IP Adresi' },
    { key: 'location', label: 'Konum' },
    { key: 'latency',  label: 'Gecikme' },
    { key: 'uptime',   label: 'Uptime' },
    { key: 'actions',  label: 'İşlemler' },
  ];
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(COLUMNS.map(c => [c.key, true]))
  );
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [historyDevice, setHistoryDevice] = useState<Device | null>(null);

  // Filtreleme değişince selection temizle
  useEffect(() => {
    setSelectedDeviceIds(new Set());
  }, [searchQuery, filterStatus, filterCategory]);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', ip_address: '', device_type: '', location: '' });
  const [duplicateDevice, setDuplicateDevice] = useState<Device | null>(null);
  const [deviceImageFile, setDeviceImageFile] = useState<File | null>(null);
  const [deviceImagePreview, setDeviceImagePreview] = useState<string | null>(null);
  const [showDeviceIconUpload, setShowDeviceIconUpload] = useState(false);
  const deviceImageInputRef = useRef<HTMLInputElement>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<number | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // İkon yükleme modal state
  const [showIconUpload, setShowIconUpload] = useState(false);
  const [iconUploadCatId, setIconUploadCatId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uptimeData, setUptimeData] = useState<Record<number, UptimeInfo>>({});
  const [trendData, setTrendData] = useState<{ time: string; online: number; offline: number }[]>([]);
  const [expandedDeviceId, setExpandedDeviceId] = useState<number | null>(null);

  // Offline bildirim açma/kapama (offlineAlerts state'i useDevices içinde)
  const [showAlerts, setShowAlerts] = useState(false);

  // Ping düğme state'leri
  const [pingingIds, setPingingIds] = useState<Set<number>>(new Set());
  const [pingFlash, setPingFlash] = useState<Map<number, 'ok' | 'err'>>(new Map());

  // API her zaman same-origin (backend frontend'i serve ediyor)
  const apiBaseRef = useRef('');
  const api = (path: string) => path;

  // Dark mode persist
  useEffect(() => { localStorage.setItem('nm_dark', String(darkMode)); }, [darkMode]);

  // categories yüklenince formData.device_type'ı ilk kategoriyle başlat
  useEffect(() => {
    if (categories.length > 0 && !formData.device_type) {
      setFormData(f => ({ ...f, device_type: categories[0].id }));
    }
  }, [categories]);

  const D = darkMode;
  const bg = D ? '#111827' : '#f9fafb';
  const surface = D ? '#1f2937' : 'white';
  const border = D ? '#374151' : '#e5e7eb';
  const textMain = D ? '#f9fafb' : '#111827';
  const textMuted = D ? '#9ca3af' : '#6b7280';
  const inputBg = D ? '#111827' : 'white';
  const headerBg = D ? '#1f2937' : '#f9fafb';
  const rowHover = D ? '#1f2937' : '#f9fafb';

  // Backend write isteği 401 dönerse: kullanıcıya net mesaj göster ve
  // Ayarlar modal'ını aç ki API Token bölümünden token girebilsin.
  useEffect(() => {
    const onAuthRequired = (e: Event) => {
      const detail = (e as CustomEvent<AuthRequiredDetail>).detail;
      const msg = detail?.reason === 'invalid'
        ? 'API Token yanlış — Ayarlar → API Token bölümünden güncelleyin'
        : 'Bu işlem için API Token gerekli — Ayarlar → API Token bölümünden girin';
      showToast(msg, true);
      setShowSettings(true);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, [showToast]);

  const getCategoryIcon = (typeId: string): { icon: string; label: string; pngUrl?: string } => {
    const cat = categories.find(c => c.id === typeId) || categories.find(c => c.id === 'other') || categories[0];
    let pngUrl: string | undefined;
    if (cat?.image_filename) {
      const base = apiBaseRef.current || '';
      const t = cat.updated_at ? new Date(cat.updated_at).getTime() : '';
      pngUrl = `${base}/api/categories/${cat.id}/image${t ? `?t=${t}` : ''}`;
    }
    return { icon: cat?.icon || '🌐', label: cat?.name || 'Diğer', pngUrl };
  };

  const getDeviceImageUrl = (device: Device): string | undefined => {
    if (!device.image_filename) return undefined;
    const base = apiBaseRef.current || '';
    const t = device.updated_at ? new Date(device.updated_at).getTime() : '';
    return `${base}/api/devices/${device.id}/image${t ? `?t=${t}` : ''}`;
  };

  // --- API ---
  // Devices + stats critical path useDevices içinde; secondary fetch'leri buradan
  // callback ile zincirliyoruz. In-flight guard hook tarafında, tek noktada.
  const fetchData = useCallback(async () => {
    await refreshDevices(async () => {
      const [resUptime, resRetention, resTrend, resCategories, resPorts, resQuickScan, resPingInt] = await Promise.all([
        fetch(api('/api/ping/uptime')).then(r => r.json()).catch(() => ({})),
        fetch(api('/api/settings/log_cleanup_days')).then(r => r.json()).catch(() => null),
        fetch(api('/api/dashboard/trend')).then(r => r.json()).catch(() => []),
        fetch(api('/api/categories/')).then(r => r.json()).catch(() => []),
        fetch(api('/api/settings/tcp_scan_ports')).then(r => r.json()).catch(() => null),
        fetch(api('/api/settings/quick_scan_interval')).then(r => r.json()).catch(() => null),
        fetch(api('/api/settings/ping_interval')).then(r => r.json()).catch(() => null),
      ]);
      if (Array.isArray(resCategories) && resCategories.length > 0) setCategories(resCategories);
      if (resRetention?.value) setHistoryRetentionDays(parseInt(resRetention.value));
      if (resQuickScan?.value) setQuickScanInterval(parseInt(resQuickScan.value) || 60);
      if (resPingInt?.value) setPingInterval(parseInt(resPingInt.value) || 300);
      if (resPorts?.value) {
        const parsed = resPorts.value.split(',').map((p: string) => parseInt(p.trim())).filter((p: number) => !isNaN(p));
        if (parsed.length > 0) setTcpPorts(parsed);
      }
      const uptimeParsed: Record<number, UptimeInfo> = {};
      Object.entries(resUptime || {}).forEach(([k, v]) => { uptimeParsed[Number(k)] = v as UptimeInfo; });
      setUptimeData(uptimeParsed);
      setTrendData(Array.isArray(resTrend) ? resTrend : []);
    });
  }, [refreshDevices]);

  // Backend hazır olana kadar 2sn aralıklarla deneyip, hazır olduğunda durur
  useEffect(() => {
    let startupTimer: ReturnType<typeof setTimeout> | null = null;
    const startupRetry = async () => {
      await fetchData();
      if (!backendReadyRef.current) startupTimer = setTimeout(startupRetry, 2000);
    };
    startupRetry();
    return () => { if (startupTimer) clearTimeout(startupTimer); };
  }, [fetchData]);

  useWebSocket({
    url: buildWebSocketUrl(apiBaseRef.current),
    onMessage: useCallback((msg: any) => {
      if (msg.type === 'ping_complete') fetchData();
      else if (msg.type === 'device_pinged') {
        setDevices(prev => prev.map(d => d.id === msg.device_id
          ? { ...d, is_online: msg.is_online, last_response_time: msg.response_time, detection_method: msg.detection_method }
          : d));
        fetchData();
      }
      else if (msg.type === 'settings_updated') {
        if (msg.key === 'log_cleanup_days') setHistoryRetentionDays(parseInt(msg.value) || 30);
        if (msg.key === 'quick_scan_interval') setQuickScanInterval(parseInt(msg.value) || 60);
        if (msg.key === 'ping_interval') setPingInterval(parseInt(msg.value) || 300);
      }
    }, [fetchData]),
    onClose: useCallback(() => { fetchData(); }, [fetchData]),
    fallbackPoll: useCallback(() => { fetchData(); }, [fetchData]),
  });

  // --- Sıralama ---
  const handleSort = (field: 'name' | 'ip_address' | 'device_type') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // --- Filtreleme + Sıralama ---
  const filteredDevices = useDeviceFilters(devices, searchQuery, filterStatus, filterCategory);

  // --- CRUD ---
  const saveDevice = async () => {
    try {
      const url = api(editId ? `/api/devices/${editId}` : '/api/devices/');
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const saved = await res.json();
        if (deviceImageFile) {
          const fd = new FormData();
          fd.append('file', deviceImageFile);
          await fetch(api(`/api/devices/${saved.id}/image`), { method: 'PUT', body: fd }).catch(() => {});
        }
        setShowModal(false); setEditId(null); setFormData({ name: '', ip_address: '', device_type: categories[0]?.id || '', location: '' });
        setDeviceImageFile(null); setDeviceImagePreview(null);
        fetchData(); showToast(editId ? 'Cihaz güncellendi' : 'Cihaz eklendi');
        if (!editId) fetch(api(`/api/ping/${saved.id}`), { method: 'POST' }).catch(() => {});
      } else {
        const err = await res.json().catch(() => null);
        showToast(err?.detail ? `Hata: ${err.detail}` : `Kayıt başarısız (${res.status})`, true);
      }
    } catch (e) { showToast(`Bağlantı hatası: ${e}`, true); }
  };

  const handleDelete = (id: number) => {
    setDeviceToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (deviceToDelete === null) return;
    try {
      const res = await fetch(api(`/api/devices/${deviceToDelete}`), { method: 'DELETE' });
      if (res.ok) {
        fetchData();
        showToast('Cihaz başarıyla silindi');
      } else {
        showToast('Silme başarısız', true);
      }
    } catch {
      showToast('Hata oluştu', true);
    } finally {
      setShowDeleteConfirm(false);
      setDeviceToDelete(null);
    }
  };

  const toggleDeviceSelection = (id: number) => {
    const newSet = new Set(selectedDeviceIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedDeviceIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedDeviceIds.size === filteredDevices.length && filteredDevices.length > 0) {
      setSelectedDeviceIds(new Set());
    } else {
      setSelectedDeviceIds(new Set(filteredDevices.map(d => d.id)));
    }
  };

  const confirmBulkDelete = async () => {
    const idsToDelete = Array.from(selectedDeviceIds);
    if (idsToDelete.length === 0) return;

    try {
      await Promise.all(
        idsToDelete.map(id => fetch(api(`/api/devices/${id}`), { method: 'DELETE' }))
      );
      fetchData();
      showToast(`${idsToDelete.length} cihaz başarıyla silindi`);
    } catch {
      showToast('Silme işlemi başarısız', true);
    } finally {
      setShowBulkDeleteConfirm(false);
      setSelectedDeviceIds(new Set());
    }
  };

  const saveRetentionDays = async () => {
    if (historyRetentionDays < 1) { showToast('En az 1 gün olmalı.', true); return; }
    try {
      const res = await fetch(api('/api/settings/log_cleanup_days'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: historyRetentionDays.toString() })
      });
      if (res.ok) showToast(`Saklama süresi ${historyRetentionDays} gün olarak ayarlandı, eski kayıtlar temizleniyor.`);
      else showToast('Ayar kaydedilemedi.', true);
    } catch { showToast('Hata oluştu.', true); }
  };

  const cleanupNow = async () => {
    try {
      const res = await fetch(api(`/api/ping/history/cleanup?days=${historyRetentionDays}`), { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        showToast(`${data.deleted} eski kayıt silindi.`);
      } else showToast('Temizleme başarısız.', true);
    } catch { showToast('Hata oluştu.', true); }
  };

  // --- Yazdır ---
  const handlePrint = () => {
    const printCols = COLUMNS.filter(c => c.key !== 'actions' && visibleColumns[c.key]);
    const header = printCols.map(c => `<th>${c.label}</th>`).join('');
    const rows = filteredDevices.map(device => {
      const info = getCategoryIcon(device.device_type);
      const u = uptimeData[device.id];
      const cells = printCols.map(c => {
        switch (c.key) {
          case 'status':   return `<td class="${device.is_online ? 'online' : 'offline'}">${device.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}</td>`;
          case 'device':   return `<td><strong>${device.name}</strong></td>`;
          case 'type':     return `<td>${info.label}</td>`;
          case 'ip':       return `<td style="font-family:monospace">${device.ip_address}</td>`;
          case 'location': return `<td>${device.location || '—'}</td>`;
          case 'latency':  return `<td>${device.is_online ? (device.last_response_time ? device.last_response_time + 'ms' : '—') : 'Zaman Aşımı'}</td>`;
          case 'uptime':   return `<td>24s: ${fmtUptime(u?.uptime_24h)} / 7g: ${fmtUptime(u?.uptime_7d)}</td>`;
          default:         return '<td></td>';
        }
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Grandmedical Hastanesi - Ağ Cihazları</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;color:#111}
  h1{font-size:17px;margin:0 0 4px}
  .meta{color:#555;font-size:12px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse}
  th{background:#f3f4f6;padding:9px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #d1d5db}
  td{padding:9px 12px;font-size:12px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f9fafb}
  .online{color:#166534;font-weight:700}.offline{color:#b91c1c;font-weight:700}
  @media print{body{padding:0}}
</style></head><body>
<h1>🖧 Grandmedical Hastanesi — Ağ Cihazları Listesi</h1>
<p class="meta">${filteredDevices.length} cihaz · ${new Date().toLocaleString('tr-TR')}</p>
<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  // --- Dışa Aktar ---
  const exportData = (type: 'xlsx' | 'json') => {
    if (type === 'json') {
      const blob = new Blob([JSON.stringify(devices, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cihazlar.json'; a.click();
    } else if (type === 'xlsx') {
      const ws_data = [
        ['İsim', 'IP Adresi', 'Kategori', 'Konum', 'Durum', 'Son Yanıt (ms)'],
        ...devices.map(d => [
          d.name,
          d.ip_address,
          d.device_type,
          d.location || '',
          d.is_online ? 'Çevrimiçi' : 'Çevrimdışı',
          d.last_response_time || ''
        ])
      ];

      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      ws['!cols'] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 20 },
        { wch: 25 },
        { wch: 15 },
        { wch: 15 }
      ];

      const headerStyle = {
        fill: { fgColor: { rgb: 'FF2563EB' } },
        font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 12 },
        alignment: { horizontal: 'center', vertical: 'center' }
      };

      for (let i = 0; i < 6; i++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
        const cell = ws[cellRef];
        if (cell) (cell as any).s = headerStyle;
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cihazlar');
      XLSX.writeFile(wb, 'cihazlar.xlsx');
    }
    showToast(`${type === 'json' ? 'JSON' : 'Excel'} indirildi`);
  };

  // --- CSV İçe Aktar ---
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    try {
      const res = await fetch(api('/api/devices/import/template-excel'));
      if (res.ok) {
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'cihaz_sablon.xlsx';
        a.click();
        showToast('Template indirildi');
      } else {
        showToast('Template indirilemedi', true);
      }
    } catch (e) {
      showToast('Hata oluştu', true);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) { showToast('Sadece .csv veya .xlsx dosyası yükleyebilirsiniz', true); return; }
    setImporting(true);
    setImportResult(null);
    try {
      let csvContent: string;

      if (file.name.endsWith('.xlsx')) {
        // Excel dosyasını parse et ve CSV'ye çevir
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Header + data ile parse et
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (data.length === 0) {
          showToast('Excel dosyasında veri yok', true);
          return;
        }

        // CSV formatına çevir (header + rows)
        const headers = Object.keys(data[0]);
        const csvLines = [
          headers.map(h => h.includes(',') || h.includes('"') ? `"${h.replace(/"/g, '""')}"` : h).join(','),
          ...data.map(row =>
            headers.map(key => {
              const cell = row[key] ?? '';
              const str = String(cell || '');
              return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(',')
          )
        ];
        csvContent = csvLines.join('\n');
      } else {
        // CSV dosyasını oku
        csvContent = await file.text();
      }

      const csvFile = new File([csvContent], 'import.csv', { type: 'text/csv' });
      const form = new FormData();
      form.append('file', csvFile);
      const res = await fetch(api('/api/devices/import/csv'), { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        setImportResult(data);
        if (data.added > 0) fetchData();
      } else {
        showToast('İçe aktarma başarısız.', true);
      }
    } catch { showToast('Hata oluştu.', true); }
    finally { setImporting(false); }
  };

  // --- PNG İkon Yükleme ---
  const handleIconUpload = (catId: string) => {
    setIconUploadCatId(catId);
    setShowIconUpload(true);
  };

  const processIconFile = (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('Sadece görsel dosyası yükleyebilirsiniz', true); return; }

    // Multipart form-data ile dosyayı gönder
    const formData = new FormData();
    formData.append('file', file);

    fetch(api(`/api/categories/${iconUploadCatId}/image`), {
      method: 'PUT',
      body: formData
    })
      .then(r => r.json())
      .then(updated => {
        setCategories(prev => prev.map(c => c.id === iconUploadCatId ? updated : c));
        setShowIconUpload(false);
        showToast('İkon güncellendi');
      })
      .catch(() => showToast('İkon güncellenemedi', true));
  };

  const processDeviceIconFile = (file: File) => {
    if (!file.type.startsWith('image/')) { showToast('Sadece görsel dosyası yükleyebilirsiniz', true); return; }
    if (editId) {
      // Mevcut cihaz — hemen yükle (kategoriyle aynı davranış)
      const fd = new FormData();
      fd.append('file', file);
      fetch(api(`/api/devices/${editId}/image`), { method: 'PUT', body: fd })
        .then(r => r.json())
        .then(updated => {
          setDevices(prev => prev.map(d => d.id === editId ? updated : d));
          setShowDeviceIconUpload(false);
          showToast('İkon güncellendi');
        })
        .catch(() => showToast('İkon güncellenemedi', true));
    } else {
      // Yeni cihaz — ID yok, kaydet butonuna basılınca yüklenecek
      setDeviceImageFile(file);
      const reader = new FileReader();
      reader.onload = ev => setDeviceImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      setShowDeviceIconUpload(false);
    }
  };

  // --- Uptime format (handlePrint için) ---
  const fmtUptime = (pct: number | null | undefined): string => {
    if (pct == null) return '—';
    return `%${pct.toFixed(1)}`;
  };

  // --- Ping gecikme renk skalası ---
  const getPingColor = (ms: number | undefined | null): string => {
    if (!ms) return textMuted;
    if (ms < 20) return '#10b981';   // yeşil
    if (ms < 100) return '#f59e0b';  // sarı
    return '#f97316';                // turuncu
  };
  // --- Ping düğmesi işlemi ---
  const handlePingDevice = useCallback(async (deviceId: number) => {
    setPingingIds(prev => new Set(prev).add(deviceId));
    try {
      const res = await fetch(api(`/api/ping/${deviceId}`), { method: 'POST' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      // Hemen loading'i kaldır, flash'ı göster
      setPingingIds(prev => { const s = new Set(prev); s.delete(deviceId); return s; });
      setPingFlash(prev => new Map(prev).set(deviceId, 'ok'));
      setTimeout(() => setPingFlash(prev => { const m = new Map(prev); m.delete(deviceId); return m; }), 1500);
      // fetchData background'da çalışsın
      fetchData().catch(err => console.error('fetchData error:', err));
    } catch (err) {
      console.error('Ping error:', err);
      setPingingIds(prev => { const s = new Set(prev); s.delete(deviceId); return s; });
      setPingFlash(prev => new Map(prev).set(deviceId, 'err'));
      setTimeout(() => setPingFlash(prev => { const m = new Map(prev); m.delete(deviceId); return m; }), 1500);
      showToast('Ping başarısız', true);
    }
  }, [fetchData, showToast]);

  const getPingButtonStyle = (deviceId: number) => {
    const isPinging = pingingIds.has(deviceId);
    const flashState = pingFlash.get(deviceId);
    let bgColor = surface, btnColor = textMuted, btnText = 'Ping', disabled = false, cursor = 'pointer';
    if (isPinging) { bgColor = '#2563eb'; btnColor = 'white'; btnText = '⚡ Ping...'; disabled = true; cursor = 'wait'; }
    else if (flashState === 'ok') { bgColor = '#10b981'; btnColor = 'white'; btnText = '✓ OK'; disabled = true; }
    else if (flashState === 'err') { bgColor = '#ef4444'; btnColor = 'white'; btnText = '✗ Hata'; disabled = true; }
    return { bgColor, btnColor, btnText, disabled, cursor };
  };

  // --- Stil yardımcıları ---
  const cardStyle = (bg2: string, borderC: string, color: string) => ({
    padding: '24px', borderRadius: '16px', backgroundColor: bg2, border: `1px solid ${borderC}`, color,
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' as const, gap: '8px'
  });

  const btnStyle = (bg2: string, color2: string, borderC: string = 'none') => ({
    padding: '10px 20px', borderRadius: '10px', backgroundColor: bg2, color: color2,
    border: borderC, fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
    transition: 'all 0.2s ease', fontSize: '14px',
    boxShadow: bg2 === 'white' || bg2 === surface ? '0 1px 3px rgba(0,0,0,0.1)' : '0 4px 12px rgba(37,99,235,0.2)'
  });


  const viewModes: { key: ViewMode; icon: string; title: string }[] = [
    { key: 'list',   icon: '☰',  title: 'Liste Görünümü' },
    { key: 'xlarge', icon: '⬛', title: 'Çok Büyük Simgeler' },
    { key: 'large',  icon: '◼',  title: 'Büyük Simgeler' },
    { key: 'medium', icon: '▪',  title: 'Orta Boyutlu Simgeler' },
    { key: 'small',  icon: '·',  title: 'Küçük Simgeler' },
  ];

  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
  };
  const modalBox = (w = '480px'): React.CSSProperties => ({
    backgroundColor: surface, padding: '40px', borderRadius: '24px', width: w,
    maxHeight: '90vh', overflowY: 'auto', color: textMain, animation: 'fadeIn 0.2s ease',
    border: `1px solid ${border}`
  });

  return (
    <div style={{ padding: 0, margin: 0, backgroundColor: bg, fontFamily: '"Inter", "Segoe UI", sans-serif', color: textMain, display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100vh' }}>
      <style>{buildStyles(D)}</style>

      {/* Toast: ToastProvider tarafından otomatik render ediliyor */}

      {/* Backend uyarı bandı */}
      {!isBackendOnline && (
        <div style={{ backgroundColor: '#ef4444', color: 'white', padding: '14px', textAlign: 'center', fontWeight: 'bold' }}>
          ⚠️ Backend Servisine Bağlanılamıyor! Uygulamayı yeniden başlatın.
        </div>
      )}

      {/* Fixed Header & Stats Section */}
      <div style={{ padding: '24px max(4vw, 20px)', borderBottom: `1px solid ${border}`, backgroundColor: bg, zIndex: 100, overflowY: 'auto', maxHeight: 'fit-content', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header */}
        <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: textMain, margin: 0 }}>🖧 Grandmedical Hastanesi Network Monitör</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px',
                backgroundColor: isBackendOnline ? '#dcfce7' : '#fee2e2',
                color: isBackendOnline ? '#166534' : '#991b1b',
                fontSize: '12px', fontWeight: '700', border: `1px solid ${isBackendOnline ? '#bbf7d0' : '#fecaca'}`
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isBackendOnline ? '#22c55e' : '#ef4444' }} />
                Servis: {isBackendOnline ? 'AÇIK' : 'KAPALI'}
              </div>
              {offlineAlerts.length > 0 && (
                <button onClick={() => setShowAlerts(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}>
                  🔔 {offlineAlerts.length} Uyarı
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { setScanning(true); fetch(api('/api/ping/all/scan'), { method: 'POST' }).then(() => setTimeout(fetchData, 2000)).finally(() => setScanning(false)); }} disabled={scanning || !isBackendOnline} style={btnStyle(surface, textMain, `1px solid ${border}`)}>
              {scanning ? '⏳ Taranıyor...' : '🔄 Tara'}
            </button>
            <button onClick={() => { setEditId(null); setFormData({ name: '', ip_address: '', device_type: categories[0]?.id || '', location: '' }); setShowModal(true); }} disabled={!isBackendOnline} style={btnStyle('#2563eb', 'white')}>
              ➕ Ekle
            </button>
            <button onClick={() => exportData('xlsx')} style={btnStyle(surface, textMain, `1px solid ${border}`)}>📥 Excel</button>
            <button onClick={() => exportData('json')} style={btnStyle(surface, textMain, `1px solid ${border}`)}>📥 JSON</button>
            <button onClick={() => { setImportResult(null); setShowImport(true); }} disabled={!isBackendOnline} style={btnStyle(surface, textMain, `1px solid ${border}`)}>📤 İçe Aktar</button>
            <button onClick={() => setDarkMode(d => !d)} style={btnStyle(surface, textMain, `1px solid ${border}`)} title="Tema Değiştir">
              {D ? '☀️' : '🌙'}
            </button>
            <button onClick={() => setShowSettings(true)} style={btnStyle(surface, textMain, `1px solid ${border}`)}>⚙️ Ayarlar</button>
          </div>
        </header>

        {/* Stat Kartları + Ortalama Ping + En Yavaş Cihazlar - HEPSİ AYNI SATIRDA */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'nowrap' }}>
          {/* Stat Kartı 1: Toplam Cihaz */}
          <div style={{ flex: '0 0 auto', minWidth: '180px', padding: '20px', borderRadius: '12px', background: D ? '#1f2937' : '#f9fafb', border: `1px solid ${border}` }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: D ? '#9ca3af' : '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Toplam Cihaz</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: D ? '#f3f4f6' : '#111827' }}>{stats.total_devices}</div>
          </div>

          {/* Stat Kartı 2: Çevrimiçi + Çevrimdışı + Ortalama Ping (Kombineli) */}
          <div style={{ flex: '0 0 auto', minWidth: '420px', padding: '20px', borderRadius: '12px', background: D ? '#1f2937' : '#f9fafb', border: `1px solid ${border}` }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: D ? '#9ca3af' : '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Durum & Ping</div>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', color: D ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Çevrimiçi</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#10b981' }}>{stats.online_devices}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: D ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Çevrimdışı</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#ef4444' }}>{stats.offline_devices}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: D ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Ort. Ping</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb' }}>
                  {(() => {
                    const onlineDevices = devices.filter(d => d.is_online && d.last_response_time);
                    if (onlineDevices.length === 0) return '—';
                    const avg = onlineDevices.reduce((sum, d) => sum + (d.last_response_time || 0), 0) / onlineDevices.length;
                    return `${Math.round(avg)}ms`;
                  })()}
                </div>
              </div>
              <div style={{ width: '1px', background: border, alignSelf: 'stretch' }} />
              <div>
                <div style={{ fontSize: '11px', color: D ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Hızlı Tarama</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#8b5cf6' }}>
                  {(() => {
                    const h = Math.floor(quickScanInterval / 3600), m = Math.floor((quickScanInterval % 3600) / 60), s = quickScanInterval % 60;
                    return [h > 0 && `${h}saat`, m > 0 && `${m}dk`, s > 0 && `${s}sn`].filter(Boolean).join(' ') || '0sn';
                  })()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: D ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Derin Tarama</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#f59e0b' }}>
                  {(() => {
                    const h = Math.floor(pingInterval / 3600), m = Math.floor((pingInterval % 3600) / 60), s = pingInterval % 60;
                    return [h > 0 && `${h}saat`, m > 0 && `${m}dk`, s > 0 && `${s}sn`].filter(Boolean).join(' ') || '0sn';
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* En Yavaş Cihazlar */}
          <div style={{ flex: '1 1 auto', minWidth: '200px', padding: '20px', borderRadius: '12px', background: D ? '#1f2937' : '#f9fafb', border: `1px solid ${border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: D ? '#9ca3af' : '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>En Yavaş Cihazlar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'flex-start' }}>
              {(() => {
                const slowest = devices
                  .filter(d => d.is_online && d.last_response_time)
                  .sort((a, b) => (b.last_response_time || 0) - (a.last_response_time || 0))
                  .slice(0, 3);
                if (slowest.length === 0) return <div style={{ color: textMuted, fontSize: '12px' }}>Veri yok</div>;
                return slowest.map((device, idx) => (
                  <div key={device.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '12px', borderBottom: idx < slowest.length - 1 ? `1px solid ${border}` : 'none' }}>
                    <span style={{ color: textMain, fontWeight: '500' }}>{idx + 1}. {device.name}</span>
                    <span style={{ color: getPingColor(device.last_response_time), fontWeight: '700' }}>{device.last_response_time}ms</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Kategori Bazında Detaylı İstatistikler - Collapsible */}
        <div style={{ borderRadius: '20px', border: `1px solid ${border}`, background: surface, overflow: 'hidden' }}>
          <button
            onClick={() => toggleSection('categoryStats')}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              background: surface,
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '700',
              color: textMain,
              borderBottom: collapsedSections.categoryStats ? 'none' : `1px solid ${border}`,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = D ? '#2d3748' : '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = surface}
          >
            <span>📊 KATEGORİLER BAZINDA DURUM</span>
            <span style={{ fontSize: '20px', transition: 'transform 0.2s', transform: collapsedSections.categoryStats ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>
          {!collapsedSections.categoryStats && (
            <div style={{ padding: '20px' }}>
              <CategoryStats devices={devices} categories={categories} dark={D} apiBase={apiBaseRef.current || ''} />
            </div>
          )}
        </div>

        {/* Kategori Gauge Chart'ları - Collapsible */}
        <div style={{ borderRadius: '20px', border: `1px solid ${border}`, background: surface, overflow: 'hidden' }}>
          <button
            onClick={() => toggleSection('categoryPie')}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              background: surface,
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '700',
              color: textMain,
              borderBottom: collapsedSections.categoryPie ? 'none' : `1px solid ${border}`,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = D ? '#2d3748' : '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = surface}
          >
            <span>📈 KATEGORİ BAZINDA (NPS GAUGE) GRAFİK</span>
            <span style={{ fontSize: '20px', transition: 'transform 0.2s', transform: collapsedSections.categoryPie ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>
          {!collapsedSections.categoryPie && (
            <div style={{ padding: '20px' }}>
              <CategoryPieCharts devices={devices} categories={categories} dark={D} apiBase={apiBaseRef.current || ''} />
            </div>
          )}
        </div>

        {/* Arama + Filtre + Görünüm Araç Çubuğu */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            filterCategory={filterCategory}
            onFilterCategoryChange={setFilterCategory}
            categories={categories}
            dark={D}
          />

          <div style={{ fontSize: '13px', color: textMuted, fontWeight: '500', whiteSpace: 'nowrap' }}>
            {filteredDevices.length} / {devices.length} cihaz
          </div>

          {viewMode === 'list' && selectedDeviceIds.size > 0 && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: textMuted, fontWeight: '500' }}>
                {selectedDeviceIds.size} seçildi
              </span>
              <button
                onClick={() => setSelectedDeviceIds(new Set())}
                style={{ fontSize: '12px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
              >
                Tümünü Kaldır
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                style={{ padding: '6px 12px', borderRadius: '8px', background: '#dc2626', color: 'white', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
              >
                🗑️ Seçilenleri Sil
              </button>
            </div>
          )}

          {viewMode === 'list' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {/* Sütun seçici */}
              <div ref={columnPickerRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowColumnPicker(p => !p)}
                  style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${border}`, background: surface, color: textMain, fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  ☰ Sütunlar ▾
                </button>
                {showColumnPicker && (
                  <>
                    <div onClick={() => setShowColumnPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 1000, background: surface, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px', minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {COLUMNS.map(col => (
                        <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: textMain, userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!visibleColumns[col.key]}
                            onChange={e => setVisibleColumns(prev => ({ ...prev, [col.key]: e.target.checked }))}
                            style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                          />
                          {col.label}
                        </label>
                      ))}
                      <div style={{ borderTop: `1px solid ${border}`, paddingTop: '8px', display: 'flex', gap: '6px' }}>
                        <button onClick={() => setVisibleColumns(Object.fromEntries(COLUMNS.map(c => [c.key, true])))} style={{ flex: 1, padding: '5px', fontSize: '11px', borderRadius: '6px', border: `1px solid ${border}`, background: 'none', color: textMuted, cursor: 'pointer' }}>Tümü</button>
                        <button onClick={() => setVisibleColumns(Object.fromEntries(COLUMNS.map(c => [c.key, false])))} style={{ flex: 1, padding: '5px', fontSize: '11px', borderRadius: '6px', border: `1px solid ${border}`, background: 'none', color: textMuted, cursor: 'pointer' }}>Hiçbiri</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Yazdır */}
              <button
                onClick={handlePrint}
                style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${border}`, background: surface, color: textMain, fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                🖨️ Yazdır
              </button>
            </div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', background: surface, padding: '4px', borderRadius: '10px', border: `1px solid ${border}` }}>
            {viewModes.map(v => (
              <button key={v.key} className={`view-btn${viewMode === v.key ? ' active' : ''}`} title={v.title} onClick={() => setViewMode(v.key)}>
                {v.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div style={{ padding: '24px max(4vw, 20px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* İçerik */}
        {viewMode === 'list' ? (
          <DeviceListView
            devices={filteredDevices}
            uptimeData={uptimeData}
            dark={D}
            getCategoryIcon={getCategoryIcon}
            getDeviceImageUrl={getDeviceImageUrl}
            getPingButtonStyle={getPingButtonStyle}
            onPing={handlePingDevice}
            onShowHistory={(device) => { setHistoryDevice(device); setShowHistory(true); }}
            onEdit={(device) => { setEditId(device.id); setFormData({ name: device.name, ip_address: device.ip_address, device_type: device.device_type, location: device.location || '' }); setDeviceImageFile(null); setDeviceImagePreview(null); setShowModal(true); }}
            onDelete={handleDelete}
            columns={COLUMNS}
            visibleColumns={visibleColumns}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            selectedDeviceIds={selectedDeviceIds}
            onToggleDevice={toggleDeviceSelection}
            onToggleAll={toggleSelectAll}
            expandedDeviceId={expandedDeviceId}
            onExpandedChange={setExpandedDeviceId}
          />
        ) : (
          <IconGridView
            mode={viewMode as 'xlarge' | 'large' | 'medium' | 'small'}
            devices={filteredDevices}
            uptimeData={uptimeData}
            dark={D}
            getCategoryIcon={getCategoryIcon}
            getDeviceImageUrl={getDeviceImageUrl}
            getPingButtonStyle={getPingButtonStyle}
            onPing={handlePingDevice}
            onShowHistory={(device) => { setHistoryDevice(device); setShowHistory(true); }}
            onEdit={(device) => { setEditId(device.id); setFormData({ name: device.name, ip_address: device.ip_address, device_type: device.device_type, location: device.location || '' }); setDeviceImageFile(null); setDeviceImagePreview(null); setShowModal(true); }}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* ===== İÇE AKTARMA MODALI ===== */}
      {showImport && (
        <div style={modalOverlay}>
          <div style={modalBox('520px')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>📤 Toplu Cihaz İçe Aktar</h2>
              <button onClick={() => setShowImport(false)} style={{ border: 'none', background: D ? '#374151' : '#f3f4f6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: textMain, fontSize: '18px' }}>×</button>
            </div>

            {/* Adım 1: Şablon */}
            <div style={{ background: D ? '#1e3a5f' : '#eff6ff', border: `1px solid ${D ? '#1d4ed8' : '#bfdbfe'}`, borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '8px', color: D ? '#93c5fd' : '#1e40af' }}>1. Adım — Şablonu İndir</div>
              <p style={{ fontSize: '12px', color: D ? '#93c5fd' : '#1e40af', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                Excel şablonunu indirin. Kategoriler ve konumlar otomatik olarak veritabanınızdan gelir.<br />
                <strong>Sütunlar:</strong> İsim · IP Adresi · Kategori · Konum<br />
                <strong>Kategori örnekleri:</strong> {categories.map(c => c.id).join(' · ') || 'Veritabanında henüz kategori yok'}
              </p>
              <button onClick={downloadTemplate} style={{ padding: '9px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                ⬇️ cihaz_sablon.xlsx İndir
              </button>
            </div>

            {/* Adım 2: Yükle */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '10px', color: textMuted }}>2. ADIM — DOLDURULMUŞ EXCEL VEYA CSV'Yİ YÜKLE</div>
              <div
                onClick={() => importFileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = border; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = border; const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                style={{ border: `2px dashed ${border}`, borderRadius: '12px', padding: '32px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s', background: D ? '#111827' : '#f9fafb' }}
              >
                {importing
                  ? <div style={{ color: textMuted, fontSize: '14px' }}>⏳ Yükleniyor...</div>
                  : <>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📂</div>
                      <div style={{ fontWeight: '600', color: textMain, fontSize: '14px' }}>Excel veya CSV dosyasını buraya sürükleyin</div>
                      <div style={{ color: textMuted, fontSize: '12px', marginTop: '4px' }}>veya tıklayarak seçin</div>
                    </>
                }
              </div>
              <input ref={importFileRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
            </div>

            {/* Sonuç */}
            {importResult && (
              <div style={{ background: D ? '#111827' : '#f9fafb', border: `1px solid ${border}`, borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '10px', color: textMain }}>İçe Aktarma Sonucu</div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: importResult.errors.length > 0 ? '12px' : '0' }}>
                  <div style={{ flex: 1, textAlign: 'center', background: D ? '#14532d' : '#f0fdf4', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: '#16a34a' }}>{importResult.added}</div>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>Eklendi</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: D ? '#1f2937' : '#f3f4f6', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: textMuted }}>{importResult.skipped}</div>
                    <div style={{ fontSize: '11px', color: textMuted, fontWeight: '600' }}>Atlandı (Tekrar IP)</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', background: importResult.errors.length > 0 ? (D ? '#7f1d1d' : '#fef2f2') : (D ? '#1f2937' : '#f3f4f6'), borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: importResult.errors.length > 0 ? '#dc2626' : textMuted }}>{importResult.errors.length}</div>
                    <div style={{ fontSize: '11px', color: importResult.errors.length > 0 ? '#dc2626' : textMuted, fontWeight: '600' }}>Hata</div>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ maxHeight: '120px', overflowY: 'auto', background: D ? '#7f1d1d' : '#fef2f2', borderRadius: '8px', padding: '10px' }}>
                    {importResult.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>⚠️ {e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setShowImport(false)} style={{ width: '100%', marginTop: '16px', padding: '13px', background: D ? '#374151' : '#f3f4f6', color: textMain, border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>Kapat</button>
          </div>
        </div>
      )}

      <SettingsModal
        show={showSettings}
        onClose={() => { setShowSettings(false); showToast('Ayarlar kaydedildi'); }}
        dark={darkMode}
        historyRetentionDays={historyRetentionDays}
        setHistoryRetentionDays={setHistoryRetentionDays}
        tcpPorts={tcpPorts}
        setTcpPorts={setTcpPorts}
        newPortInput={newPortInput}
        setNewPortInput={setNewPortInput}
        categories={categories}
        setCategories={setCategories}
        isBackendOnline={isBackendOnline}
        saveRetentionDays={saveRetentionDays}
        cleanupNow={cleanupNow}
        handleIconUpload={handleIconUpload}
        api={api}
        showToast={showToast}
      />

      {/* ===== CİHAZ ÖZEL GÖRSEL YÜKLEME MODALI ===== */}
      {showDeviceIconUpload && (
        <div style={{ ...modalOverlay, zIndex: 3500 }}>
          <div style={modalBox('420px')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>🖼️ Cihaz Özel Görsel Ekle</h2>
              <button onClick={() => setShowDeviceIconUpload(false)} style={{ border: 'none', background: D ? '#374151' : '#f3f4f6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: textMain, fontSize: '18px' }}>×</button>
            </div>

            <div style={{ background: D ? '#1e3a5f' : '#eff6ff', border: `1px solid ${D ? '#1d4ed8' : '#bfdbfe'}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: D ? '#93c5fd' : '#1e40af', lineHeight: '1.6' }}>
              <div style={{ fontWeight: '700', marginBottom: '6px' }}>ℹ️ Bilgi</div>
              <div>📐 <b>512×512 PNG</b> yükleyiniz.</div>
              <div style={{ marginTop: '4px' }}>
                Kaynak olarak{' '}
                <a href="https://www.flaticon.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: '700' }}>
                  flaticon.com
                </a>{' '}
                sitesinden yararlanabilirsiniz.
              </div>
            </div>

            <div
              onClick={() => deviceImageInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processDeviceIconFile(f); }}
              style={{ border: `2px dashed ${border}`, borderRadius: '16px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: D ? '#111827' : '#f9fafb', transition: 'all 0.2s' }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
              <div style={{ fontWeight: '600', color: textMain, marginBottom: '6px' }}>Tıkla veya sürükle & bırak</div>
              <div style={{ fontSize: '12px', color: textMuted }}>PNG, JPG, SVG — 512×512 önerilir</div>
            </div>
            <input
              ref={deviceImageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) processDeviceIconFile(f); e.target.value = ''; }}
            />

            <button onClick={() => setShowDeviceIconUpload(false)} style={{ width: '100%', marginTop: '16px', padding: '12px', border: `1px solid ${border}`, background: surface, color: textMain, borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}>İptal</button>
          </div>
        </div>
      )}

      {/* ===== İKON YÜKLEME MODALI ===== */}
      {showIconUpload && (
        <div style={{ ...modalOverlay, zIndex: 3500 }}>
          <div style={modalBox('420px')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>🖼️ İkon Değiştir</h2>
              <button onClick={() => setShowIconUpload(false)} style={{ border: 'none', background: D ? '#374151' : '#f3f4f6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: textMain, fontSize: '18px' }}>×</button>
            </div>

            {/* Uyarı kutusu */}
            <div style={{ background: D ? '#1e3a5f' : '#eff6ff', border: `1px solid ${D ? '#1d4ed8' : '#bfdbfe'}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: D ? '#93c5fd' : '#1e40af', lineHeight: '1.6' }}>
              <div style={{ fontWeight: '700', marginBottom: '6px' }}>ℹ️ Bilgi</div>
              <div>📐 <b>512×512 PNG</b> yükleyiniz.</div>
              <div style={{ marginTop: '4px' }}>
                Kaynak olarak{' '}
                <a href="https://www.flaticon.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: '700' }}>
                  flaticon.com
                </a>{' '}
                sitesinden yararlanabilirsiniz.
              </div>
            </div>

            {/* Sürükle & Bırak / Tıkla alanı */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) processIconFile(f); }}
              style={{ border: `2px dashed ${border}`, borderRadius: '16px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: D ? '#111827' : '#f9fafb', transition: 'all 0.2s' }}
            >
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
              <div style={{ fontWeight: '600', color: textMain, marginBottom: '6px' }}>Tıkla veya sürükle & bırak</div>
              <div style={{ fontSize: '12px', color: textMuted }}>PNG, JPG, SVG — 512×512 önerilir</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) processIconFile(f); }}
            />

            <button onClick={() => setShowIconUpload(false)} style={{ width: '100%', marginTop: '16px', padding: '12px', border: `1px solid ${border}`, background: surface, color: textMain, borderRadius: '12px', cursor: 'pointer', fontWeight: '600' }}>İptal</button>
          </div>
        </div>
      )}

      <DeviceFormModal
        show={showModal}
        onClose={() => { setShowModal(false); setDeviceImageFile(null); setDeviceImagePreview(null); }}
        dark={darkMode}
        editId={editId}
        formData={formData}
        setFormData={setFormData}
        categories={categories}
        deviceImagePreview={deviceImagePreview}
        setDeviceImagePreview={setDeviceImagePreview}
        deviceImageFile={deviceImageFile}
        setDeviceImageFile={setDeviceImageFile}
        devices={devices}
        onSubmit={e => {
          e.preventDefault();
          if (!editId && devices.find(d => d.ip_address === formData.ip_address)) {
            setDuplicateDevice(devices.find(d => d.ip_address === formData.ip_address)!);
            setShowDuplicateModal(true);
          } else saveDevice();
        }}
        onImageRemove={async () => {
          if (deviceImagePreview) {
            setDeviceImageFile(null); setDeviceImagePreview(null);
          } else if (editId) {
            await fetch(api(`/api/devices/${editId}/image`), { method: 'DELETE' }).catch(() => {});
            setDevices(prev => prev.map(d => d.id === editId ? { ...d, image_filename: undefined } : d));
            showToast('İkon kaldırıldı');
          }
        }}
        setShowDeviceIconUpload={setShowDeviceIconUpload}
        apiBaseRef={apiBaseRef}
      />

      {/* ===== DUPLICATE IP MODALI ===== */}
      {showDuplicateModal && duplicateDevice && (
        <div style={{ ...modalOverlay, zIndex: 3000 }}>
          <div style={{ ...modalBox('380px'), textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '10px' }}>IP Zaten Kayıtlı!</h2>
            <p style={{ color: textMuted, marginBottom: '24px' }}>Bu IP adresi <b style={{ color: textMain }}>{duplicateDevice.name}</b> cihazına atanmış.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDuplicateModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${border}`, background: surface, color: textMain, cursor: 'pointer', fontWeight: '600' }}>Vazgeç</button>
              <button onClick={() => { setShowDuplicateModal(false); setEditId(duplicateDevice.id); setFormData({ name: duplicateDevice.name, ip_address: duplicateDevice.ip_address, device_type: duplicateDevice.device_type, location: duplicateDevice.location || '' }); setDeviceImageFile(null); setDeviceImagePreview(null); setShowModal(true); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#2563eb', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}>Düzenle</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CIHAZ SİLME ONAY MODALI ===== */}
      {showDeleteConfirm && deviceToDelete !== null && (
        <div style={{ ...modalOverlay, zIndex: 3000 }}>
          <div style={{ ...modalBox('380px'), textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗑️</div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '10px' }}>Cihazı Sil</h2>
            <p style={{ color: textMuted, marginBottom: '24px' }}>
              Bu cihazı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeviceToDelete(null); }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${border}`, background: surface, color: textMain, cursor: 'pointer', fontWeight: '600' }}
              >Vazgeç</button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#dc2626', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}
              >Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOPLU SİLME ONAY MODALI ===== */}
      {showBulkDeleteConfirm && selectedDeviceIds.size > 0 && (
        <div style={{ ...modalOverlay, zIndex: 3000 }}>
          <div style={{ ...modalBox('420px'), textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗑️</div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '10px' }}>
              {selectedDeviceIds.size} Cihazı Sil
            </h2>
            <p style={{ color: textMuted, marginBottom: '24px' }}>
              {selectedDeviceIds.size} cihazı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowBulkDeleteConfirm(false); }}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${border}`, background: surface, color: textMain, cursor: 'pointer', fontWeight: '600' }}
              >Vazgeç</button>
              <button
                onClick={confirmBulkDelete}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#dc2626', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}
              >{selectedDeviceIds.size} Cihazı Sil</button>
            </div>
          </div>
        </div>
      )}

      <HistoryModal
        show={showHistory}
        onClose={() => setShowHistory(false)}
        device={historyDevice}
        dark={darkMode}
      />

      {/* ===== OFFLİNE UYARI GEÇMİŞİ MODALI ===== */}
      {showAlerts && (
        <div style={modalOverlay}>
          <div style={modalBox('480px')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>🔔 Çevrimdışı Uyarıları</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setOfflineAlerts([])} style={{ padding: '6px 12px', border: `1px solid ${border}`, background: surface, color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Temizle</button>
                <button onClick={() => setShowAlerts(false)} style={{ border: 'none', background: D ? '#374151' : '#f3f4f6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: textMain, fontSize: '18px' }}>×</button>
              </div>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {offlineAlerts.map((alert, i) => (
                <div key={i} style={{ padding: '12px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: textMain }}>{alert.deviceName}</div>
                    <div style={{ fontSize: '12px', color: textMuted }}>{alert.time.toLocaleString('tr-TR')}</div>
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', fontWeight: '700' }}>Çevrimdışı</span>
                </div>
              ))}
              {offlineAlerts.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: textMuted }}>Henüz uyarı yok.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;