import { useCategoryStats } from '../hooks/useCategoryStats';

interface Device {
  id: number;
  device_type: string;
  is_online: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  image_filename?: string;
  updated_at?: string;
}

export function CategoryPieCharts({ devices, categories, dark, apiBase }: { devices: Device[]; categories: Category[]; dark: boolean; apiBase: string }) {
  const stats = useCategoryStats(devices, categories);
  const textMuted = dark ? '#9ca3af' : '#6b7280';

  if (categories.length === 0 || stats.length === 0) {
    return <div style={{ fontSize: '13px', color: textMuted, textAlign: 'center', padding: '20px' }}>Kategori verisi yok</div>;
  }

  const textColor = dark ? '#9ca3af' : '#6b7280';
  const labelColor = dark ? '#f3f4f6' : '#111827';
  const surface = dark ? '#1f2937' : '#ffffff';
  const border = dark ? '#374151' : '#e5e7eb';
  const trackColor = dark ? '#4b5563' : '#d1d5db';

  const getCategoryImage = (cat: Category) => {
    if (cat.image_filename) {
      const t = cat.updated_at ? new Date(cat.updated_at).getTime() : '';
      return `${apiBase}/api/categories/${cat.id}/image${t ? `?t=${t}` : ''}`;
    }
    return undefined;
  };

  const GaugeChart = ({ online, offline, name, icon, pngUrl }: { online: number; offline: number; name: string; icon: string; pngUrl?: string }) => {
    const total = online + offline;
    if (total === 0) return null;

    const percent = (online / total) * 100;

    // Gauge parameters: bottom-facing semicircle (speedometer style)
    const cx = 60, cy = 48, R = 36;
    const circumference = Math.PI * R;
    const fillLength = (percent / 100) * circumference;

    // Track path: left to right curving downward (clockwise sweep=1)
    const trackPath = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: surface, borderRadius: '12px', border: `1px solid ${border}`, minWidth: '160px' }}>
        {/* Header: name LEFT, stats RIGHT */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {pngUrl ? (
              <img src={pngUrl} alt={name} style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '18px' }}>{icon}</span>
            )}
            <div style={{ fontSize: '13px', fontWeight: '700', color: labelColor }}>
              {name} <span style={{ fontWeight: '600', color: textColor }}>({total})</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', fontSize: '11px', fontWeight: '700' }}>
            <span style={{ color: '#10b981' }}>🟢 {online}</span>
            <span style={{ color: '#ef4444' }}>🔴 {offline}</span>
          </div>
        </div>

        {/* NPS Gauge Chart */}
        <svg viewBox="0 0 120 95" style={{ width: '100%', maxWidth: '110px', height: 'auto', margin: '0 auto' }}>
          {/* Background track */}
          <path
            d={trackPath}
            fill="none"
            stroke={trackColor}
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Fill track (online) */}
          {percent > 0 && (
            <path
              d={trackPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${fillLength} ${circumference}`}
              strokeDashoffset="0"
            />
          )}
          {/* Percentage text - at gauge level */}
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fontSize="16"
            fontWeight="700"
            fill={labelColor}
          >
            {percent.toFixed(0)}%
          </text>
          {/* Scale labels at bottom - same row */}
          <text
            x={cx - R + 2}
            y={cy + 36}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={textColor}
          >
            0
          </text>
          <text
            x={cx + R - 2}
            y={cy + 36}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill={textColor}
          >
            {total}
          </text>
        </svg>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
      {stats.map(s => (
        <GaugeChart
          key={s.category.id}
          online={s.online}
          offline={s.offline}
          name={s.category.name}
          icon={s.category.icon}
          pngUrl={getCategoryImage(s.category)}
        />
      ))}
    </div>
  );
}
