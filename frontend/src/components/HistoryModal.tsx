import { useState, useEffect, useRef } from 'react';
import { Sparkline } from './Sparkline';

type TimeRange = 'now' | '1h' | '6h' | '12h' | '1d' | '3d';

interface Device {
  id: number;
  name: string;
  ip_address: string;
  device_type: string;
  is_online: boolean;
  last_response_time?: number;
  location?: string;
  hostname?: string;
  vendor?: string;
  detection_method?: string;
  open_ports?: string;
  mac_address?: string;
  image_filename?: string;
  updated_at?: string;
}

interface PingLog {
  id: number;
  timestamp: string;
  success: boolean;
  response_time: number | null;
}

interface HistoryModalProps {
  show: boolean;
  onClose: () => void;
  device: Device | null;
  dark: boolean;
}

const TIME_RANGES = [
  { key: 'now', label: 'Son Şuan', ms: 15 * 60 * 1000 },
  { key: '1h',  label: 'Son 1 Saat', ms: 60 * 60 * 1000 },
  { key: '6h',  label: 'Son 6 Saat', ms: 6 * 60 * 60 * 1000 },
  { key: '12h', label: 'Son 12 Saat', ms: 12 * 60 * 60 * 1000 },
  { key: '1d',  label: '1 Gün', ms: 24 * 60 * 60 * 1000 },
  { key: '3d',  label: '3 Gün', ms: 3 * 24 * 60 * 60 * 1000 },
] as const;

export function HistoryModal({ show, onClose, device, dark }: HistoryModalProps) {
  const [range, setRange] = useState<TimeRange>('1h');
  const [logs, setLogs] = useState<PingLog[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cihaz değişince range sıfırla
  useEffect(() => { setRange('1h'); }, [device?.id]);

  // Modal açılınca veya cihaz değişince 3 günlük veriyi tek seferde çek
  useEffect(() => {
    if (!show || !device) { setLogs([]); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    fetch(`/api/ping/history/${device.id}?hours=72`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => { setLogs(Array.isArray(data) ? data : []); })
      .catch(err => { if (err.name !== 'AbortError') setLogs([]); })
      .finally(() => setLoading(false));

    return () => { ctrl.abort(); };
  }, [show, device?.id]);

  if (!show || !device) return null;

  const D = dark;
  const bg      = D ? '#111827' : '#f9fafb';
  const surface = D ? '#1f2937' : 'white';
  const border  = D ? '#374151' : '#e5e7eb';
  const textMain  = D ? '#f9fafb' : '#111827';
  const textMuted = D ? '#9ca3af' : '#6b7280';

  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  };
  const modalBox: React.CSSProperties = {
    backgroundColor: surface, padding: '40px', borderRadius: '24px',
    width: '580px', maxHeight: '90vh', overflowY: 'auto', color: textMain,
    animation: 'fadeIn 0.2s ease', border: `1px solid ${border}`,
  };

  const getPingColor = (ms: number | undefined | null): string => {
    if (!ms) return textMuted;
    if (ms < 20) return '#10b981';
    if (ms < 100) return '#f59e0b';
    return '#f97316';
  };

  // Client-side range filter (veri zaten 3 günlük, yeniden fetch gerekmez)
  const selectedRange = TIME_RANGES.find(r => r.key === range);
  const cutoff = Date.now() - (selectedRange?.ms ?? 60 * 60 * 1000);
  const filtered = logs.filter(l => new Date(l.timestamp + 'Z').getTime() >= cutoff);

  const successLogs = filtered.filter(l => l.success && l.response_time != null);
  const minMs = successLogs.length > 0 ? Math.min(...successLogs.map(l => l.response_time!)) : 0;
  const maxMs = successLogs.length > 0 ? Math.max(...successLogs.map(l => l.response_time!)) : 0;
  const avgMs = successLogs.length > 0
    ? Math.round(successLogs.reduce((s, l) => s + l.response_time!, 0) / successLogs.length)
    : 0;

  return (
    <div style={modalOverlay}>
      <div style={modalBox}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>🕰️ Ping Geçmişi: {device.name}</h3>
          <button onClick={onClose} style={{ border: 'none', background: D ? '#374151' : '#f3f4f6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: textMain, fontSize: '18px' }}>×</button>
        </div>

        {/* Device info */}
        {(device.detection_method || device.hostname || device.mac_address || device.vendor) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
            {device.detection_method && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: textMuted, marginBottom: '3px' }}>İLETİŞİM YÖNTEMİ</div>
                <span style={{ fontSize: '12px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px',
                  background: device.detection_method === 'ICMP' ? (D ? '#14532d' : '#dcfce7') : device.detection_method.startsWith('TCP') ? (D ? '#1e3a5f' : '#dbeafe') : device.detection_method === 'ARP' ? (D ? '#78350f' : '#fef3c7') : (D ? '#374151' : '#f3f4f6'),
                  color: device.detection_method === 'ICMP' ? '#16a34a' : device.detection_method.startsWith('TCP') ? '#2563eb' : device.detection_method === 'ARP' ? '#d97706' : textMuted,
                }}>{device.detection_method}</span>
              </div>
            )}
            {device.hostname && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: textMuted, marginBottom: '3px' }}>HOSTNAME</div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: textMain }}>{device.hostname}</div>
              </div>
            )}
            {device.mac_address && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: textMuted, marginBottom: '3px' }}>MAC ADRESİ</div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: textMain }}>{device.mac_address}</div>
              </div>
            )}
            {device.vendor && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: textMuted, marginBottom: '3px' }}>ÜRETİCİ</div>
                <div style={{ fontSize: '13px', color: textMain }}>{device.vendor}</div>
              </div>
            )}
          </div>
        )}

        {/* Time range buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {TIME_RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key as TimeRange)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${range === r.key ? '#2563eb' : border}`,
                background: range === r.key ? '#2563eb' : surface, cursor: 'pointer',
                fontSize: '12px', fontWeight: '600', color: range === r.key ? 'white' : textMuted, transition: 'all 0.15s',
              }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: textMuted }}>Yükleniyor...</div>
        )}

        {/* Sparkline */}
        {!loading && filtered.filter(l => l.success).length >= 2 && (
          <div style={{ background: bg, borderRadius: '12px', padding: '16px', marginBottom: '16px', border: `1px solid ${border}` }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: textMuted, marginBottom: '8px' }}>
              YANIT SÜRESİ GRAFİĞİ ({filtered.length} kayıt)
            </div>
            <Sparkline logs={filtered} width={480} height={48} dark={D} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: textMuted }}>
              <span>Min: {minMs}ms</span>
              <span>Ort: {avgMs}ms</span>
              <span>Max: {maxMs}ms</span>
            </div>
          </div>
        )}

        {/* Log list */}
        {!loading && (
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: textMuted }}>Bu aralıkta kayıt bulunamadı.</div>
            ) : (
              filtered.map(log => (
                <div key={log.id} style={{ padding: '10px 12px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                  <span style={{ color: textMuted }}>{new Date(log.timestamp + 'Z').toLocaleString('tr-TR')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: 'monospace', color: log.success ? getPingColor(log.response_time) : '#ef4444', fontWeight: '600' }}>
                      {log.success ? `${log.response_time}ms` : 'Zaman Aşımı'}
                    </span>
                    <span style={{ fontSize: '16px' }}>{log.success ? '✅' : '❌'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
