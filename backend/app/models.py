from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    ip_address = Column(String(45), nullable=False, index=True)
    device_type = Column(String(20), default="other") # phone, tv, pc, other
    mac_address = Column(String(17), nullable=True)
    location = Column(String(100), nullable=True)

    is_online = Column(Boolean, default=False)
    last_ping_time = Column(DateTime(timezone=True), nullable=True)
    last_response_time = Column(Integer, nullable=True) # ms cinsinden

    # Multi-method detection alanları
    hostname = Column(String(255), nullable=True)
    vendor = Column(String(100), nullable=True)
    detection_method = Column(String(50), nullable=True)  # "ICMP" | "TCP (port X)" | "ARP" | "Ulaşılamadı"
    open_ports = Column(String(100), nullable=True)       # virgülle ayrılmış port listesi, ör: "80,443"

    # Cihaza özel ikon (static/categories/ altında saklanır)
    image_filename = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # İlişkiler
    logs = relationship("PingLog", back_populates="device", cascade="all, delete-orphan")

class PingLog(Base):
    __tablename__ = "ping_logs"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    success = Column(Boolean, nullable=False)
    response_time = Column(Integer, nullable=True) # ms
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # İlişkiler
    device = relationship("Device", back_populates="logs")

    __table_args__ = (
        Index("idx_ping_logs_device_ts", "device_id", "timestamp"),
    )

class PingLogHourly(Base):
    """
    Saatlik özetlenmiş ping istatistikleri. ping_logs ham tablosundan rollup edilir;
    uptime sorguları milyonlarca satırı taramak yerine cihaz başına saatlik tek satır okur.
    """
    __tablename__ = "ping_logs_hourly"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    hour = Column(DateTime(timezone=True), nullable=False)  # saat başına truncate edilmiş timestamp
    total = Column(Integer, nullable=False, default=0)
    success_count = Column(Integer, nullable=False, default=0)
    avg_response_time = Column(Integer, nullable=True)  # ms

    __table_args__ = (
        Index("idx_ping_hourly_device_hour", "device_id", "hour", unique=True),
        Index("idx_ping_hourly_hour", "hour"),
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    icon = Column(String(10), nullable=False)
    image_filename = Column(String(255), nullable=True)  # dosya adı (static/categories/ altında)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=True)
