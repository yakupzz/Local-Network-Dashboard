export function Toast({ notification }: { notification: { msg: string; error?: boolean } | null }) {
  if (!notification) return null;
  return (
    <div style={{ animation: 'slideInUp 0.3s ease-out', position: 'fixed', bottom: '30px', right: '30px', background: notification.error ? '#ef4444' : '#10b981', color: 'white', padding: '14px 28px', borderRadius: '12px', boxShadow: notification.error ? '0 10px 25px rgba(239,68,68,0.25)' : '0 10px 25px rgba(16,185,129,0.25)', zIndex: 5000, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
      {notification.error ? '❌' : '✅'} {notification.msg}
    </div>
  );
}
