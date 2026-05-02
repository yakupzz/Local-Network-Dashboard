import React from 'react';

interface DeviceFormModalProps {
  show: boolean;
  onClose: () => void;
  dark: boolean;
  editId: number | null;
  formData: { name: string; ip_address: string; device_type: string; location: string };
  setFormData: (data: { name: string; ip_address: string; device_type: string; location: string }) => void;
  categories: Array<{ id: string; name: string; icon: string; image_filename?: string; updated_at?: string }>;
  deviceImagePreview: string | null;
  setDeviceImagePreview: (preview: string | null) => void;
  deviceImageFile: File | null;
  setDeviceImageFile: (file: File | null) => void;
  devices: Array<{ id: number; name: string; ip_address: string; device_type: string; is_online: boolean; image_filename?: string }>;
  onSubmit: (e: React.FormEvent) => void;
  onImageRemove: () => Promise<void>;
  setShowDeviceIconUpload: (show: boolean) => void;
  apiBaseRef: React.MutableRefObject<string>;
}

export const DeviceFormModal: React.FC<DeviceFormModalProps> = ({
  show,
  onClose,
  dark: D,
  editId,
  formData,
  setFormData,
  categories,
  deviceImagePreview,
  setDeviceImagePreview,
  deviceImageFile,
  setDeviceImageFile,
  devices,
  onSubmit,
  onImageRemove,
  setShowDeviceIconUpload,
  apiBaseRef,
}) => {
  // Theme colors
  const bg = D ? '#111827' : '#ffffff';
  const surface = D ? '#1f2937' : '#f3f4f6';
  const border = D ? '#374151' : '#e5e7eb';
  const textMain = D ? '#f3f4f6' : '#111827';
  const textMuted = D ? '#9ca3af' : '#6b7280';
  const inputBg = D ? '#111827' : '#ffffff';

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '10px',
    border: `1px solid ${border}`,
    background: inputBg,
    color: textMain,
    fontSize: '14px',
    fontFamily: 'inherit',
  };

  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  };

  const modalBox = (width: string): React.CSSProperties => ({
    background: bg,
    borderRadius: '20px',
    padding: '28px',
    width,
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
    color: textMain,
  });

  if (!show) return null;

  return (
    <div style={modalOverlay}>
      <div style={modalBox('440px')}>
        <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '24px', marginTop: 0 }}>{editId ? '📝 Cihazı Düzenle' : '✨ Yeni Cihaz Ekle'}</h2>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: textMuted }}>CİHAZ ADI *</label>
            <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={inputStyle} placeholder="Örn: Oturma Odası Smart TV" />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: textMuted }}>IP ADRESİ *</label>
            <input required value={formData.ip_address} onChange={e => setFormData({ ...formData, ip_address: e.target.value })} style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="192.168.1.10" />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: textMuted }}>CİHAZ TİPİ</label>
            <select value={formData.device_type} onChange={e => setFormData({ ...formData, device_type: e.target.value })} style={inputStyle}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: textMuted }}>KONUM (İsteğe bağlı)</label>
            <input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} style={inputStyle} placeholder="Örn: Mutfak, Salon, 1. Kat..." />
          </div>
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: textMuted }}>ÖZEL İKON (İsteğe bağlı)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button type="button" onClick={() => setShowDeviceIconUpload(true)}
                style={{ width: '60px', height: '60px', borderRadius: '12px', border: `2px dashed ${border}`, background: surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, overflow: 'hidden' }}>
                {deviceImagePreview
                  ? <img src={deviceImagePreview} alt="önizleme" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
                  : editId && devices.find(d => d.id === editId)?.image_filename
                    ? <img src={`${apiBaseRef.current || ''}/api/devices/${editId}/image`} alt="ikon" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '24px', color: textMuted }}>+</span>}
              </button>
              <div style={{ flex: 1, fontSize: '12px', color: textMuted }}>
                {(deviceImagePreview || (editId && devices.find(d => d.id === editId)?.image_filename))
                  ? 'Özel ikon seçildi — değiştirmek için tıkla'
                  : 'Seçilmedi — kategori ikonu kullanılacak'}
              </div>
              {(deviceImagePreview || (editId && devices.find(d => d.id === editId)?.image_filename)) && (
                <button type="button" onClick={onImageRemove} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#b91c1c', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Kaldır
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={() => { onClose(); setDeviceImageFile(null); setDeviceImagePreview(null); }} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: `1px solid ${border}`, background: surface, color: textMain, cursor: 'pointer', fontWeight: '600' }}>İptal</button>
            <button type="submit" style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#2563eb', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}>Kaydet</button>
          </div>
        </form>
      </div>
    </div>
  );
};
