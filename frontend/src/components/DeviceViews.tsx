import React from 'react';
import type { Device } from '../hooks/useDevices';

export type IconViewMode = 'xlarge' | 'large' | 'medium' | 'small';

export interface UptimeInfo {
  uptime_24h: number | null;
  uptime_7d: number | null;
}

export interface CategoryIconInfo {
  icon: string;
  label: string;
  pngUrl?: string;
}

export interface PingButtonStyle {
  bgColor: string;
  btnColor: string;
  btnText: string;
  disabled: boolean;
  cursor: string;
}

interface DeviceViewCommonProps {
  devices: Device[];                                   // already filtered + sorted
  uptimeData: Record<number, UptimeInfo>;
  dark: boolean;
  getCategoryIcon: (typeId: string) => CategoryIconInfo;
  getDeviceImageUrl: (device: Device) => string | undefined;
  getPingButtonStyle: (deviceId: number) => PingButtonStyle;
  onPing: (id: number) => void;
  onShowHistory: (device: Device) => void;
  onEdit: (device: Device) => void;
  onDelete: (id: number) => void;
}

// ── theme helpers ─────────────────────────────────────────────────────────────

const themeColors = (dark: boolean) => ({
  surface: dark ? '#1f2937' : 'white',
  border: dark ? '#374151' : '#e5e7eb',
  textMain: dark ? '#f9fafb' : '#111827',
  textMuted: dark ? '#9ca3af' : '#6b7280',
  headerBg: dark ? '#1f2937' : '#f9fafb',
});

const getPingColor = (ms: number | undefined | null, fallback: string): string => {
  if (!ms) return fallback;
  if (ms < 20) return '#10b981';
  if (ms < 100) return '#f59e0b';
  return '#f97316';
};

const getUptimeColor = (pct: number | null | undefined, fallback: string): string => {
  if (pct == null) return fallback;
  if (pct >= 99) return '#10b981';
  if (pct >= 95) return '#f59e0b';
  if (pct >= 80) return '#f97316';
  return '#ef4444';
};

const fmtUptime = (pct: number | null | undefined): string =>
  pct == null ? '—' : `%${pct.toFixed(1)}`;

const getPingRowBg = (device: Device, dark: boolean): string => {
  if (!device.is_online) return dark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)';
  if (!device.last_response_time) return 'transparent';
  if (device.last_response_time < 20) return dark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)';
  if (device.last_response_time < 100) return dark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)';
  return dark ? 'rgba(249,115,22,0.07)' : 'rgba(249,115,22,0.05)';
};

const ICON_VIEW_CONFIG: Record<IconViewMode, {
  iconSize: number; nameFontSize: string; gridMin: string;
  padding: string; ipFontSize: string; dotSize: string;
}> = {
  xlarge: { iconSize: 72, nameFontSize: '18px', gridMin: '180px', padding: '28px 16px', ipFontSize: '13px', dotSize: '12px' },
  large:  { iconSize: 52, nameFontSize: '13px', gridMin: '140px', padding: '20px 12px', ipFontSize: '11px', dotSize: '10px' },
  medium: { iconSize: 36, nameFontSize: '12px', gridMin: '110px', padding: '14px 10px', ipFontSize: '10px', dotSize: '8px'  },
  small:  { iconSize: 24, nameFontSize: '11px', gridMin: '90px',  padding: '10px 8px',  ipFontSize: '10px', dotSize: '7px'  },
};

// ── IconGridView ──────────────────────────────────────────────────────────────

interface IconGridViewProps extends DeviceViewCommonProps {
  mode: IconViewMode;
}

export function IconGridView({
  mode, devices, uptimeData, dark,
  getCategoryIcon, getDeviceImageUrl, getPingButtonStyle,
  onPing, onShowHistory, onEdit, onDelete,
}: IconGridViewProps) {
  const t = themeColors(dark);
  const cfg = ICON_VIEW_CONFIG[mode];
  const showActions = mode === 'xlarge' || mode === 'large';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${cfg.gridMin}, 1fr))`,
      gap: mode === 'small' ? '8px' : mode === 'medium' ? '12px' : '16px',
    }}>
      {devices.map(device => {
        const info = getCategoryIcon(device.device_type);
        const displayImgUrl = getDeviceImageUrl(device) || info.pngUrl;
        const u = uptimeData[device.id];
        return (
          <div key={device.id} className="device-card" style={{
            background: t.surface,
            borderRadius: mode === 'small' ? '10px' : '16px',
            border: `1.5px solid ${device.is_online ? (dark ? '#166534' : '#bbf7d0') : (dark ? '#991b1b' : '#fecaca')}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            padding: cfg.padding, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: mode === 'small' ? '6px' : '10px',
            position: 'relative', cursor: 'default',
          }}>
            <div
              className={device.is_online ? 'pulse-dot' : 'pulse-dot-fast'}
              style={{ position: 'absolute', top: '10px', right: '10px', width: cfg.dotSize, height: cfg.dotSize, borderRadius: '50%', backgroundColor: device.is_online ? '#10b981' : '#ef4444' }}
            />
            {displayImgUrl
              ? <img src={displayImgUrl} alt={info.label} style={{ width: cfg.iconSize, height: cfg.iconSize, objectFit: 'contain' }} />
              : <div style={{ fontSize: cfg.iconSize, lineHeight: 1 }}>{info.icon}</div>}
            <div style={{ fontWeight: 700, fontSize: cfg.nameFontSize, color: t.textMain, textAlign: 'center', wordBreak: 'break-word', width: '100%' }}>{device.name}</div>
            {mode !== 'small' && (
              <div style={{ fontSize: cfg.ipFontSize, fontFamily: 'monospace', color: t.textMuted, textAlign: 'center' }}>{device.ip_address}</div>
            )}
            {device.location && mode !== 'small' && (
              <div style={{ fontSize: mode === 'xlarge' ? '12px' : '10px', color: t.textMuted, textAlign: 'center' }}>📍 {device.location}</div>
            )}
            {showActions && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ fontSize: mode === 'xlarge' ? '13px' : '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', backgroundColor: device.is_online ? '#dcfce7' : '#fee2e2', color: device.is_online ? '#166534' : '#991b1b' }}>
                  {device.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}
                </div>
                {device.is_online && (
                  <div style={{ fontSize: mode === 'xlarge' ? '13px' : '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', backgroundColor: dark ? '#1f2937' : '#f3f4f6', color: getPingColor(device.last_response_time, t.textMuted), border: `1px solid ${t.border}` }}>
                    {device.last_response_time ? `${device.last_response_time}ms` : '—'}
                  </div>
                )}
              </div>
            )}
            {showActions && u && (
              <div style={{ display: 'flex', gap: '6px', fontSize: mode === 'xlarge' ? '12px' : '10px', fontWeight: 700 }}>
                <span style={{ color: getUptimeColor(u.uptime_24h, t.textMuted) }}>24s: {fmtUptime(u.uptime_24h)}</span>
                <span style={{ color: t.textMuted }}>·</span>
                <span style={{ color: getUptimeColor(u.uptime_7d, t.textMuted) }}>7g: {fmtUptime(u.uptime_7d)}</span>
              </div>
            )}
            {mode === 'medium' && device.is_online && device.last_response_time && (
              <div style={{ fontSize: '10px', fontWeight: 700, color: getPingColor(device.last_response_time, t.textMuted) }}>
                {device.last_response_time}ms
              </div>
            )}
            {showActions && (() => {
              const { bgColor, btnColor, btnText, disabled, cursor } = getPingButtonStyle(device.id);
              const btnPad = mode === 'xlarge' ? '6px 12px' : '4px 8px';
              const btnFs = mode === 'xlarge' ? '12px' : '11px';
              return (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
                  <button onClick={() => onPing(device.id)} disabled={disabled} style={{ padding: btnPad, borderRadius: '6px', border: `1px solid ${t.border}`, background: bgColor, color: btnColor, fontSize: btnFs, cursor, fontWeight: btnText !== 'Ping' ? 700 : 600, transition: 'all 0.2s' }}>{btnText}</button>
                  <button onClick={() => onShowHistory(device)} style={{ padding: btnPad, borderRadius: '6px', border: `1px solid ${t.border}`, background: t.surface, color: t.textMain, fontSize: btnFs, cursor: 'pointer' }}>Geçmiş</button>
                  <button onClick={() => onEdit(device)} style={{ padding: btnPad, borderRadius: '6px', border: `1px solid ${t.border}`, background: t.surface, color: t.textMain, fontSize: btnFs, cursor: 'pointer' }}>Düzenle</button>
                  <button onClick={() => onDelete(device.id)} style={{ padding: btnPad, borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#b91c1c', fontSize: btnFs, cursor: 'pointer' }}>Sil</button>
                </div>
              );
            })()}
          </div>
        );
      })}
      {devices.length === 0 && (
        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 20px', color: t.textMuted }}>Eşleşen cihaz bulunamadı.</div>
      )}
    </div>
  );
}

// ── DeviceListView ────────────────────────────────────────────────────────────

export interface ListViewColumn { key: string; label: string }

interface DeviceListViewProps extends DeviceViewCommonProps {
  columns: ListViewColumn[];
  visibleColumns: Record<string, boolean>;
  sortField: 'name' | 'ip_address' | 'device_type' | null;
  sortDir: 'asc' | 'desc';
  onSort: (field: 'name' | 'ip_address' | 'device_type') => void;
  selectedDeviceIds: Set<number>;
  onToggleDevice: (id: number) => void;
  onToggleAll: () => void;
  expandedDeviceId: number | null;
  onExpandedChange: (id: number | null) => void;
}

export function DeviceListView({
  devices, uptimeData, dark,
  getCategoryIcon, getDeviceImageUrl, getPingButtonStyle,
  onPing, onShowHistory, onEdit, onDelete,
  columns, visibleColumns: vc,
  sortField, sortDir, onSort,
  selectedDeviceIds, onToggleDevice, onToggleAll,
  expandedDeviceId, onExpandedChange,
}: DeviceListViewProps) {
  const t = themeColors(dark);
  const visibleCount = columns.filter(c => vc[c.key]).length;
  const thStyle: React.CSSProperties = { padding: '16px 20px', color: t.textMuted, fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em' };
  const sortMark = (field: typeof sortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const allChecked = selectedDeviceIds.size === devices.length && devices.length > 0;
  const someChecked = selectedDeviceIds.size > 0 && selectedDeviceIds.size < devices.length;

  return (
    <div style={{ background: t.surface, borderRadius: '20px', border: `1px solid ${t.border}`, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead style={{ background: t.headerBg, borderBottom: `1px solid ${t.border}` }}>
          <tr>
            <th style={{ ...thStyle, width: '40px', padding: '16px 12px', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={onToggleAll}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                ref={(el) => { if (el) el.indeterminate = someChecked; }}
              />
            </th>
            {vc.status   && <th style={thStyle}>DURUM</th>}
            {vc.device   && <th className="sort-th" style={thStyle} onClick={() => onSort('name')}>CİHAZ BİLGİSİ{sortMark('name')}</th>}
            {vc.type     && <th className="sort-th" style={thStyle} onClick={() => onSort('device_type')}>TÜR{sortMark('device_type')}</th>}
            {vc.ip       && <th className="sort-th" style={thStyle} onClick={() => onSort('ip_address')}>IP ADRESİ{sortMark('ip_address')}</th>}
            {vc.location && <th style={thStyle}>KONUM</th>}
            {vc.latency  && <th style={thStyle}>GECİKME</th>}
            {vc.uptime   && <th style={thStyle}>UPTIME</th>}
            {vc.actions  && <th style={{ ...thStyle, textAlign: 'right' }}>İŞLEMLER</th>}
          </tr>
        </thead>
        <tbody>
          {devices.map(device => {
            const info = getCategoryIcon(device.device_type);
            const displayImgUrl = getDeviceImageUrl(device) || info.pngUrl;
            const u = uptimeData[device.id];
            const isExpanded = expandedDeviceId === device.id;
            const hasDetail = !!(device.hostname || device.vendor || device.mac_address || device.detection_method || device.open_ports);
            return (
              <React.Fragment key={device.id}>
                <tr style={{
                  borderBottom: isExpanded ? 'none' : `1px solid ${t.border}`,
                  background: getPingRowBg(device, dark),
                  cursor: hasDetail ? 'pointer' : 'default',
                }}
                  onClick={() => hasDetail && onExpandedChange(isExpanded ? null : device.id)}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.95)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}>
                  <td style={{ padding: '12px', width: '40px', textAlign: 'center', borderRight: `1px solid ${t.border}` }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedDeviceIds.has(device.id)}
                      onChange={() => onToggleDevice(device.id)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </td>
                  {vc.status && (
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className={device.is_online ? 'pulse-dot' : 'pulse-dot-fast'} style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: device.is_online ? '#10b981' : '#ef4444', flexShrink: 0 }} />
                        {hasDetail && <span style={{ fontSize: '10px', color: t.textMuted }}>{isExpanded ? '▲' : '▼'}</span>}
                      </div>
                    </td>
                  )}
                  {vc.device && (
                    <td style={{ padding: '16px 20px', color: t.textMain }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {displayImgUrl
                          ? <img src={displayImgUrl} alt={info.label} style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                          : <span style={{ fontSize: '20px' }}>{info.icon}</span>}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{device.name}</div>
                          <div style={{ fontSize: '11px', color: t.textMuted }}>{info.label}</div>
                        </div>
                      </div>
                    </td>
                  )}
                  {vc.type && (
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', backgroundColor: dark ? '#1f2937' : '#f3f4f6', color: t.textMuted, border: `1px solid ${t.border}` }}>{info.label}</span>
                    </td>
                  )}
                  {vc.ip       && <td style={{ padding: '16px 20px', fontFamily: 'monospace', color: t.textMuted, fontSize: '13px' }}>{device.ip_address}</td>}
                  {vc.location && <td style={{ padding: '16px 20px', color: t.textMuted, fontSize: '13px' }}>{device.location ? `📍 ${device.location}` : '—'}</td>}
                  {vc.latency  && (
                    <td style={{ padding: '16px 20px', color: device.is_online ? getPingColor(device.last_response_time, t.textMuted) : '#ef4444', fontWeight: 600, fontSize: '13px' }}>
                      {device.is_online ? (device.last_response_time ? `${device.last_response_time}ms` : '—') : 'Zaman Aşımı'}
                    </td>
                  )}
                  {vc.uptime && (
                    <td style={{ padding: '16px 20px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ color: getUptimeColor(u?.uptime_24h, t.textMuted), fontWeight: 600 }}>24s: {fmtUptime(u?.uptime_24h)}</span>
                        <span style={{ color: getUptimeColor(u?.uptime_7d, t.textMuted), fontWeight: 600 }}>7g: {fmtUptime(u?.uptime_7d)}</span>
                      </div>
                    </td>
                  )}
                  {vc.actions && (
                    <td style={{ padding: '16px 20px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {(() => {
                          const { bgColor, btnColor, btnText, disabled, cursor } = getPingButtonStyle(device.id);
                          return <button onClick={() => onPing(device.id)} disabled={disabled} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: bgColor, color: btnColor, fontSize: '12px', cursor, fontWeight: btnText !== 'Ping' ? 700 : 600, transition: 'all 0.2s' }}>{btnText}</button>;
                        })()}
                        <button onClick={() => onShowHistory(device)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.surface, color: t.textMain, fontSize: '12px', cursor: 'pointer' }}>Geçmiş</button>
                        <button onClick={() => onEdit(device)} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.surface, color: t.textMain, fontSize: '12px', cursor: 'pointer' }}>Düzenle</button>
                        <button onClick={() => onDelete(device.id)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', cursor: 'pointer' }}>Sil</button>
                      </div>
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <tr style={{ borderBottom: `1px solid ${t.border}`, background: dark ? '#0f172a' : '#f8fafc' }}>
                    <td colSpan={visibleCount + 1} style={{ padding: '0 20px 16px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', paddingTop: '12px', paddingLeft: '8px' }}>
                        {device.detection_method && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, marginBottom: '3px' }}>TESPİT YÖNTEMİ</div>
                            <span style={{
                              fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                              background: device.detection_method === 'ICMP' ? (dark ? '#14532d' : '#dcfce7')
                                : device.detection_method.startsWith('TCP') ? (dark ? '#1e3a5f' : '#dbeafe')
                                : device.detection_method === 'ARP' ? (dark ? '#78350f' : '#fef3c7')
                                : (dark ? '#374151' : '#f3f4f6'),
                              color: device.detection_method === 'ICMP' ? '#16a34a'
                                : device.detection_method.startsWith('TCP') ? '#2563eb'
                                : device.detection_method === 'ARP' ? '#d97706'
                                : t.textMuted,
                            }}>{device.detection_method}</span>
                          </div>
                        )}
                        {device.hostname && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, marginBottom: '3px' }}>HOSTNAME</div>
                            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: t.textMain }}>{device.hostname}</div>
                          </div>
                        )}
                        {device.mac_address && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, marginBottom: '3px' }}>MAC ADRESİ</div>
                            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: t.textMain }}>{device.mac_address}</div>
                          </div>
                        )}
                        {device.vendor && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, marginBottom: '3px' }}>ÜRETİCİ</div>
                            <div style={{ fontSize: '13px', color: t.textMain }}>{device.vendor}</div>
                          </div>
                        )}
                        {device.open_ports && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: t.textMuted, marginBottom: '3px' }}>AÇIK PORTLAR</div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {device.open_ports.split(',').map(p => (
                                <span key={p} style={{ fontSize: '11px', fontFamily: 'monospace', padding: '2px 8px', borderRadius: '6px', background: dark ? '#1e3a5f' : '#dbeafe', color: '#2563eb', fontWeight: 600 }}>{p}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {devices.length === 0 && (
            <tr><td colSpan={visibleCount + 1} style={{ padding: '60px 20px', textAlign: 'center', color: t.textMuted }}>Eşleşen cihaz bulunamadı.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
