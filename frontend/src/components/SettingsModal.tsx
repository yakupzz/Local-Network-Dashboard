import React, { useState, useEffect } from 'react';
import { getApiToken, setApiToken } from '../api/authFetch';

interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
  dark: boolean;
  historyRetentionDays: number;
  setHistoryRetentionDays: (val: number) => void;
  tcpPorts: number[];
  setTcpPorts: (val: number[]) => void;
  newPortInput: string;
  setNewPortInput: (val: string) => void;
  categories: Array<{ id: string; name: string; icon: string; image_filename?: string; updated_at?: string }>;
  setCategories: (val: any[]) => void;
  isBackendOnline: boolean;
  saveRetentionDays: () => void;
  cleanupNow: () => void;
  handleIconUpload: (categoryId: string) => void;
  api: (path: string) => string;
  showToast: (msg: string, error?: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  show,
  onClose,
  dark: D,
  historyRetentionDays,
  setHistoryRetentionDays,
  tcpPorts,
  setTcpPorts,
  newPortInput,
  setNewPortInput,
  categories,
  setCategories,
  isBackendOnline,
  saveRetentionDays,
  cleanupNow,
  handleIconUpload,
  api,
  showToast,
}) => {
  const DEFAULT_TCP_PORTS = [80, 443, 22, 3389, 445, 135, 8080, 8443];

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

  // API Token state — modal açıldığında localStorage'dan oku
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaved, setTokenSaved] = useState<boolean>(() => !!getApiToken());
  const [showTokenValue, setShowTokenValue] = useState(false);

  // Kategori silme onay modalı (window.confirm yerine UI'a uygun custom dialog)
  const [categoryToDelete, setCategoryToDelete] = useState<typeof categories[number] | null>(null);

  const confirmDeleteCategory = () => {
    if (!categoryToDelete) return;
    const cat = categoryToDelete;
    setCategories(categories.filter(c => c.id !== cat.id));
    fetch(api(`/api/categories/${cat.id}`), { method: 'DELETE' }).catch(() => {});
    showToast('Kategori silindi');
    setCategoryToDelete(null);
  };

  useEffect(() => {
    if (show) {
      const t = getApiToken();
      setTokenInput(t);
      setTokenSaved(!!t);
    }
  }, [show]);

  const saveToken = () => {
    const trimmed = tokenInput.trim();
    setApiToken(trimmed);
    setTokenSaved(!!trimmed);
    showToast(trimmed ? '✓ API Token kaydedildi' : 'API Token temizlendi');
  };

  const clearToken = () => {
    setApiToken('');
    setTokenInput('');
    setTokenSaved(false);
    showToast('API Token kaldırıldı');
  };

  if (!show) return null;

  return (
    <div style={modalOverlay}>
      <div style={modalBox('540px')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>⚙️ Sistem Ayarları</h2>
          <button onClick={onClose} style={{ border: 'none', background: D ? '#374151' : '#f3f4f6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', color: textMain, fontSize: '18px' }}>×</button>
        </div>

        {/* API Token */}
        <div style={{ paddingBottom: '24px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <label style={{ fontWeight: '700', fontSize: '13px', color: textMuted, margin: 0 }}>API TOKEN</label>
            <span style={{
              fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px',
              background: tokenSaved ? '#10b98122' : '#f59e0b22',
              color: tokenSaved ? '#10b981' : '#f59e0b',
            }}>
              {tokenSaved ? '✓ Girilmiş' : '⚠ Girilmemiş'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: textMuted, margin: '0 0 10px 0' }}>
            Cihaz izleme (read-only) token gerektirmez. Cihaz ekleme / düzenleme / silme
            ve ayar güncellemeleri için <code style={{ background: surface, padding: '1px 6px', borderRadius: '4px' }}>backend/.env</code>
            içindeki <code style={{ background: surface, padding: '1px 6px', borderRadius: '4px' }}>API_TOKEN</code> değerini buraya gir.
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type={showTokenValue ? 'text' : 'password'}
              placeholder="netWork2025"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveToken(); }}
              style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setShowTokenValue(v => !v)}
              title={showTokenValue ? 'Gizle' : 'Göster'}
              style={{ padding: '10px 12px', background: surface, color: textMain, border: `1px solid ${border}`, borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}
            >
              {showTokenValue ? '🙈' : '👁️'}
            </button>
            <button
              onClick={saveToken}
              style={{ padding: '12px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >Kaydet</button>
            {tokenSaved && (
              <button
                onClick={clearToken}
                style={{ padding: '12px 16px', background: 'transparent', color: '#ef4444', border: `1px solid ${border}`, borderRadius: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                title="Token'ı bu tarayıcıdan kaldır"
              >Temizle</button>
            )}
          </div>
        </div>

        {/* Ping geçmişi saklama süresi */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: '24px', marginBottom: '28px' }}>
          <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '4px', color: textMuted }}>PİNG GEÇMİŞİ SAKLAMA SÜRESİ</label>
          <p style={{ fontSize: '12px', color: textMuted, margin: '0 0 10px 0' }}>
            Belirtilen günden eski ping kayıtları her gece 03:00'da otomatik silinir. "Şimdi Temizle" ile anında uygulayabilirsiniz.
          </p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="number" min={1} max={365}
              value={historyRetentionDays}
              onChange={e => setHistoryRetentionDays(parseInt(e.target.value) || 30)}
              style={{ ...inputStyle, width: '90px' }}
            />
            <span style={{ color: textMuted, fontSize: '13px' }}>gün</span>
            <button onClick={saveRetentionDays} style={{ padding: '12px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>Kaydet</button>
            <button onClick={cleanupNow} style={{ padding: '12px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>🗑️ Şimdi Temizle</button>
          </div>
        </div>

        {/* TCP Port Tarama Listesi */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: '24px', marginBottom: '28px' }}>
          <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '4px', color: textMuted }}>TCP PORT TARAMA LİSTESİ</label>
          <p style={{ fontSize: '12px', color: textMuted, margin: '0 0 12px 0' }}>
            ICMP ping başarısız olduğunda bu portlara TCP bağlantısı denenir. İlk açık port tespit yöntemi olarak kaydedilir; tüm açık portlar listelenir.
          </p>
          {/* Mevcut portlar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {tcpPorts.map(port => {
              const isDefault = DEFAULT_TCP_PORTS.includes(port);
              const bgColor = isDefault ? (D ? '#1f2937' : '#e5e7eb') : (D ? '#1e3a5f' : '#dbeafe');
              const textColor = isDefault ? '#9ca3af' : '#2563eb';
              return (
                <div key={port} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: bgColor, borderRadius: '8px', padding: '5px 10px' }}>
                  <span style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: '700', color: textColor }}>{port}</span>
                  {!isDefault && (
                    <button
                      onClick={() => {
                        const updated = tcpPorts.filter(p => p !== port);
                        setTcpPorts(updated);
                        fetch(api('/api/settings/tcp_scan_ports'), {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ value: updated.join(',') })
                        }).catch(() => {});
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: textColor, fontSize: '14px', lineHeight: 1, padding: '0 0 0 2px', fontWeight: '700' }}
                      title="Kaldır"
                    >×</button>
                  )}
                </div>
              );
            })}
            {tcpPorts.length === 0 && <span style={{ fontSize: '12px', color: textMuted }}>Port yok — tüm cihazlar yalnızca ICMP ile taranır.</span>}
          </div>
          {/* Yeni port ekle */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="number" min={1} max={65535}
              placeholder="Port numarası (ör: 8080)"
              value={newPortInput}
              onChange={e => setNewPortInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.nextElementSibling?.dispatchEvent(new MouseEvent('click'));
              }}
              style={{ ...inputStyle, width: '220px' }}
            />
            <button
              onClick={() => {
                const p = parseInt(newPortInput);
                if (!p || p < 1 || p > 65535 || tcpPorts.includes(p)) { setNewPortInput(''); return; }
                const updated = [...tcpPorts, p].sort((a, b) => a - b);
                setTcpPorts(updated);
                setNewPortInput('');
                fetch(api('/api/settings/tcp_scan_ports'), {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ value: updated.join(',') })
                }).then(() => showToast('Port eklendi')).catch(() => showToast('Kaydedilemedi', true));
              }}
              style={{ padding: '12px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >+ Ekle</button>
          </div>
        </div>

        {/* Kategori yönetimi */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: '24px' }}>
          <label style={{ display: 'block', fontWeight: '700', fontSize: '13px', marginBottom: '14px', color: textMuted }}>KATEGORİ YÖNETİMİ</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {categories.map((cat) => (
              <div key={cat.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: D ? '#111827' : '#f9fafb', padding: '10px', borderRadius: '12px', border: `1px solid ${border}` }}>
                <button
                  onClick={() => handleIconUpload(cat.id)}
                  title="İkon değiştir"
                  style={{ width: '44px', height: '44px', borderRadius: '10px', border: `2px dashed ${border}`, background: surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, overflow: 'hidden' }}
                >
                  {cat.image_filename
                    ? <img src={`/api/categories/${cat.id}/image${cat.updated_at ? `?t=${new Date(cat.updated_at).getTime()}` : ''}`} alt={cat.name} style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '22px' }}>{cat.icon}</span>
                  }
                </button>
                <input
                  value={cat.icon}
                  onChange={e => {
                    setCategories(categories.map(c => c.id === cat.id ? { ...c, icon: e.target.value } : c));
                    fetch(api(`/api/categories/${cat.id}`), {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ icon: e.target.value })
                    }).catch(() => {});
                  }}
                  style={{ width: '50px', textAlign: 'center', border: `1px solid ${border}`, background: inputBg, color: textMain, padding: '6px', borderRadius: '8px', fontSize: '18px' }}
                  title="Emoji ikon"
                />
                <input
                  value={cat.name}
                  onChange={e => {
                    setCategories(categories.map(c => c.id === cat.id ? { ...c, name: e.target.value } : c));
                    fetch(api(`/api/categories/${cat.id}`), {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: e.target.value })
                    }).catch(() => {});
                  }}
                  style={{ flex: 1, border: 'none', background: 'transparent', fontWeight: '600', color: textMain, fontSize: '14px' }}
                />
                <button
                  onClick={() => {
                    if (categories.length > 1) setCategoryToDelete(cat);
                  }}
                  disabled={categories.length <= 1}
                  title={categories.length <= 1 ? 'En az bir kategori bulunmalı' : 'Kategoriyi sil'}
                  style={{
                    color: categories.length <= 1 ? textMuted : '#ef4444',
                    border: 'none', background: 'none',
                    cursor: categories.length <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    opacity: categories.length <= 1 ? 0.4 : 1,
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const newCat = { id: `cat_${Date.now()}`, name: 'Yeni Birim', icon: '📦' };
                fetch(api('/api/categories/'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newCat)
                })
                  .then(r => r.json())
                  .then(created => {
                    setCategories([...categories, created]);
                    showToast('Yeni kategori eklendi');
                  })
                  .catch(() => showToast('Kategori eklenemedi', true));
              }}
              style={{ padding: '12px', border: `2px dashed ${border}`, borderRadius: '12px', color: textMuted, background: 'none', cursor: 'pointer', fontSize: '14px' }}
            >
              + Yeni Kategori Ekle
            </button>
          </div>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: '8px', padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', fontSize: '15px' }}>Tamam ve Kapat</button>
      </div>

      {/* ===== KATEGORİ SİLME ONAY MODALI ===== */}
      {categoryToDelete && (
        <div style={{ ...modalOverlay, zIndex: 3000 }}>
          <div style={{ ...modalBox('400px'), textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗑️</div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '10px' }}>Kategoriyi Sil</h2>
            <p style={{ color: textMuted, marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
              <strong style={{ color: textMain }}>"{categoryToDelete.name}"</strong> kategorisini silmek istediğinizden emin misiniz?
              {categoryToDelete.image_filename && (
                <><br /><span style={{ fontSize: '12px' }}>İlişkili resim de silinecektir.</span></>
              )}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setCategoryToDelete(null)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${border}`, background: surface, color: textMain, cursor: 'pointer', fontWeight: '600' }}
              >Vazgeç</button>
              <button
                onClick={confirmDeleteCategory}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#dc2626', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}
              >Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
