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

export function CategoryStats({ devices, categories, dark, apiBase }: { devices: Device[]; categories: Category[]; dark: boolean; apiBase: string }) {
  const stats = useCategoryStats(devices, categories);
  const bg = dark ? '#111827' : '#ffffff';
  const border = dark ? '#374151' : '#e5e7eb';
  const surface = dark ? '#1f2937' : '#f9fafb';
  const textMain = dark ? '#f3f4f6' : '#111827';
  const textMuted = dark ? '#9ca3af' : '#6b7280';

  if (categories.length === 0 || stats.length === 0) {
    return <div style={{ fontSize: '13px', color: textMuted, textAlign: 'center', padding: '20px' }}>Kategori verisi yok</div>;
  }

  const getCategoryImage = (cat: Category) => {
    if (cat.image_filename) {
      const t = cat.updated_at ? new Date(cat.updated_at).getTime() : '';
      return `${apiBase}/api/categories/${cat.id}/image${t ? `?t=${t}` : ''}`;
    }
    return undefined;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {stats.map(s => {
          const onlinePercent = s.total > 0 ? (s.online / s.total) * 100 : 0;
          const imgUrl = getCategoryImage(s.category);
          return (
            <div key={s.category.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: surface, flexShrink: 0, overflow: 'hidden' }}>
                  {imgUrl ? (
                    <img src={imgUrl} alt={s.category.name} style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: '18px' }}>{s.category.icon}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.category.name}
                  </div>
                  <div style={{ fontSize: '11px', color: textMuted, fontWeight: '500' }}>
                    Toplam: {s.total}
                  </div>
                </div>
              </div>
              <div style={{ background: dark ? '#374151' : '#f3f4f6', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#10b981', width: `${onlinePercent}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', fontWeight: '600' }}>
                <span style={{ color: '#10b981' }}>🟢 {s.online}</span>
                <span style={{ color: '#ef4444' }}>🔴 {s.offline}</span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
