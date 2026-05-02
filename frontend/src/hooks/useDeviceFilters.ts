interface FilterableDevice {
  id: number;
  name: string;
  ip_address: string;
  device_type: string;
  is_online: boolean;
  location?: string;
}

// Generic'e bağlı: caller'ın tam Device tipi (last_response_time, hostname vs.) korunur.
export function useDeviceFilters<T extends FilterableDevice>(
  devices: T[],
  searchQuery: string,
  filterStatus: 'all' | 'online' | 'offline',
  filterCategory: string
): T[] {
  return devices
    .filter(d => {
      const q = searchQuery.toLowerCase();
      const matchText = !q || d.name.toLowerCase().includes(q) || d.ip_address.includes(q) || (d.location || '').toLowerCase().includes(q);
      const matchStatus = filterStatus === 'all' || (filterStatus === 'online' && d.is_online) || (filterStatus === 'offline' && !d.is_online);
      const matchCategory = filterCategory === 'all' || d.device_type === filterCategory;
      return matchText && matchStatus && matchCategory;
    })
    .sort((a, b) => {
      // Primary sort: device_type
      const aType = (a.device_type || '').toString().toLowerCase();
      const bType = (b.device_type || '').toString().toLowerCase();
      const typeComp = aType.localeCompare(bType);
      if (typeComp !== 0) return typeComp;

      // Secondary sort: name (always ascending)
      const aName = (a.name || '').toString().toLowerCase();
      const bName = (b.name || '').toString().toLowerCase();
      return aName.localeCompare(bName);
    });
}
