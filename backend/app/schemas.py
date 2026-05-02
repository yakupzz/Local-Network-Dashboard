from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# --- Device Şemaları ---
class DeviceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    ip_address: str = Field(..., pattern=r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$")
    device_type: str = "other"
    mac_address: Optional[str] = None
    location: Optional[str] = None

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: Optional[str] = None
    mac_address: Optional[str] = None
    location: Optional[str] = None

class DeviceOut(DeviceBase):
    id: int
    is_online: bool
    last_ping_time: Optional[datetime] = None
    last_response_time: Optional[int] = None
    hostname: Optional[str] = None
    vendor: Optional[str] = None
    detection_method: Optional[str] = None
    open_ports: Optional[str] = None
    image_filename: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- PingLog Şemaları ---
class PingLogOut(BaseModel):
    id: int
    device_id: int
    success: bool
    response_time: Optional[int]
    timestamp: datetime

    class Config:
        from_attributes = True

# --- Category Şemaları ---
class CategoryBase(BaseModel):
    id: str
    name: str
    icon: str
    image_filename: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    image_filename: Optional[str] = None

class CategoryOut(CategoryBase):
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- Settings Şemaları ---
class SettingBase(BaseModel):
    key: str
    value: str

class SettingUpdate(BaseModel):
    value: str

class SettingOut(SettingBase):
    id: int

    class Config:
        from_attributes = True

# --- Dashboard Özet şeması ---
class DashboardStats(BaseModel):
    total_devices: int
    online_devices: int
    offline_devices: int
    last_scan_time: Optional[datetime] = None
