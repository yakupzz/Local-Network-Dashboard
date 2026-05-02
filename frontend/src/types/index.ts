export interface Device {
  id: number;
  name: string;
  ip_address: string;
  device_type: string;
  mac_address?: string;
  location?: string;
  is_online: boolean;
  last_ping_time?: string;
  last_response_time?: number;
  created_at: string;
  updated_at?: string;
}

export interface DeviceCreate {
  name: string;
  ip_address: string;
  device_type: string;
  mac_address?: string;
  location?: string;
}

export interface DashboardStats {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  last_scan_time?: string;
}

export interface PingLog {
  id: number;
  device_id: number;
  success: boolean;
  response_time?: number;
  timestamp: string;
}
