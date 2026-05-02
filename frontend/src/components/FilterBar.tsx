import React from 'react';

export type FilterStatus = 'all' | 'online' | 'offline';

interface Category {
  id: string;
  name: string;
  icon: string;
}

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterStatus: FilterStatus;
  onFilterStatusChange: (s: FilterStatus) => void;
  filterCategory: string;
  onFilterCategoryChange: (c: string) => void;
  categories: Category[];
  dark: boolean;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  filterCategory,
  onFilterCategoryChange,
  categories,
  dark,
}: FilterBarProps) {
  const border = dark ? '#374151' : '#e5e7eb';
  const surface = dark ? '#1f2937' : 'white';
  const textMain = dark ? '#f9fafb' : '#111827';
  const textMuted = dark ? '#9ca3af' : '#6b7280';
  const inputBg = dark ? '#111827' : 'white';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${border}`,
    background: inputBg, color: textMain, fontSize: '14px'
  };

  const selectStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: '10px', border: `1px solid ${border}`,
    background: surface, color: textMain, fontSize: '14px', cursor: 'pointer',
  };

  return (
    <>
      <div style={{ flex: '1 1 200px', position: 'relative', minWidth: '180px' }}>
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: textMuted }}>🔍</span>
        <input
          className="search-input"
          placeholder="Cihaz ara (ad, IP, konum)..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{ ...inputStyle, paddingLeft: '36px', borderRadius: '10px' }}
        />
      </div>

      <select value={filterStatus} onChange={e => onFilterStatusChange(e.target.value as FilterStatus)} style={selectStyle}>
        <option value="all">Tüm Durumlar</option>
        <option value="online">Çevrimiçi</option>
        <option value="offline">Çevrimdışı</option>
      </select>

      <select value={filterCategory} onChange={e => onFilterCategoryChange(e.target.value)} style={selectStyle}>
        <option value="all">Tüm Kategoriler</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
      </select>
    </>
  );
}
