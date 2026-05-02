import { useCallback, useRef, useState } from 'react';

export interface Device {
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
  last_ping_time?: string;
  created_at?: string;
}

export interface DeviceStats {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
}

export interface OfflineAlert {
  deviceId: number;
  deviceName: string;
  time: Date;
}

export interface UseDevicesOptions {
  /**
   * Bir cihaz online → offline geçtiğinde tetiklenir.
   * App.tsx burada toast gösterir; hook UI logic'inden bağımsız kalır.
   */
  onDeviceOffline?: (device: Device) => void;
}

const EMPTY_STATS: DeviceStats = { total_devices: 0, online_devices: 0, offline_devices: 0 };

export function useDevices(opts: UseDevicesOptions = {}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<DeviceStats>(EMPTY_STATS);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [offlineAlerts, setOfflineAlerts] = useState<OfflineAlert[]>([]);

  const prevDevicesRef = useRef<Device[]>([]);
  const fetchInFlightRef = useRef(false);
  const backendReadyRef = useRef(false);

  // Latest opts via ref → refresh callback'i opts değişince yeniden yaratılmaz
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /**
   * Cihaz listesi + stats çek. Eş zamanlı çağrı engellenir (in-flight guard).
   * `secondary` opsiyonu: kritik veri başarıyla geldikten sonra çalıştırılan
   * ek fetch zinciri (uptime, trend, settings vs.). Aynı in-flight guard
   * altında akar; primary başarısız olursa secondary tetiklenmez.
   *
   * Dönen değer: true = istek çalıştı, false = guard zaten meşguldü.
   */
  const refresh = useCallback(async (secondary?: () => Promise<void>) => {
    if (fetchInFlightRef.current) return false;
    fetchInFlightRef.current = true;
    try {
      const [resStats, resDevices] = await Promise.all([
        fetch('/api/ping/stats/summary').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch('/api/devices/').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);

      const newDevices: Device[] = resDevices || [];
      setStats(resStats || EMPTY_STATS);

      if (prevDevicesRef.current.length > 0) {
        newDevices.forEach(nd => {
          const old = prevDevicesRef.current.find(od => od.id === nd.id);
          if (old && old.is_online && !nd.is_online) {
            setOfflineAlerts(prev => [{ deviceId: nd.id, deviceName: nd.name, time: new Date() }, ...prev].slice(0, 50));
            optsRef.current.onDeviceOffline?.(nd);
          }
        });
      }
      prevDevicesRef.current = newDevices;
      setDevices(newDevices);
      setIsBackendOnline(true);
      backendReadyRef.current = true;

      if (secondary) {
        try { await secondary(); } catch { /* secondary hatası backend-online'ı düşürmesin */ }
      }
      return true;
    } catch {
      setIsBackendOnline(false);
      return false;
    } finally {
      fetchInFlightRef.current = false;
    }
  }, []);

  return {
    devices,
    setDevices,
    stats,
    isBackendOnline,
    offlineAlerts,
    setOfflineAlerts,
    backendReadyRef,
    refresh,
  };
}
