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

interface CategoryStat {
  category: Category;
  total: number;
  online: number;
  offline: number;
}

export function useCategoryStats(devices: Device[], categories: Category[]): CategoryStat[] {
  return categories
    .map(cat => {
      const catDevices = devices.filter(d => d.device_type === cat.id);
      const online = catDevices.filter(d => d.is_online).length;
      const offline = catDevices.filter(d => !d.is_online).length;
      return { category: cat, total: catDevices.length, online, offline };
    })
    .filter(s => s.total > 0);
}
