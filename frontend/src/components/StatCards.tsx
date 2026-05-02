interface Stats {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
}

export function StatCards({ stats, dark }: { stats: Stats; dark: boolean }) {
  const cardStyle = { flex: '1', minWidth: '200px', padding: '20px', borderRadius: '12px', background: dark ? '#1f2937' : '#f9fafb', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}` };
  const labelStyle = { fontSize: '13px', fontWeight: '600', color: dark ? '#9ca3af' : '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const valueStyle = { fontSize: '28px', fontWeight: '800', color: dark ? '#f3f4f6' : '#111827' };
  return (
    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
      <div style={cardStyle}><div style={labelStyle}>Toplam Cihaz</div><div style={valueStyle}>{stats.total_devices}</div></div>
      <div style={cardStyle}><div style={labelStyle}>Çevrimiçi</div><div style={{ ...valueStyle, color: '#10b981' }}>{stats.online_devices}</div></div>
      <div style={cardStyle}><div style={labelStyle}>Çevrimdışı</div><div style={{ ...valueStyle, color: '#ef4444' }}>{stats.offline_devices}</div></div>
    </div>
  );
}
