interface PingLog {
  id: number;
  timestamp: string;
  success: boolean;
  response_time: number | null;
}

export function Sparkline({ logs, width = 120, height = 32, dark = false }: { logs: PingLog[]; width?: number; height?: number; dark?: boolean }) {
  const recent = logs.filter(l => l.success && l.response_time != null).slice(-20);
  const textColor = dark ? '#9ca3af' : '#6b7280';
  if (recent.length < 2) return <span style={{ fontSize: '11px', color: textColor }}>Yetersiz veri</span>;
  const times = recent.map(l => l.response_time as number);
  const max = Math.max(...times, 1);
  const pts = times.map((t, i) => {
    const x = (i / (times.length - 1)) * width;
    const y = height - (t / max) * (height - 4);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {times.map((t, i) => {
        const x = (i / (times.length - 1)) * width;
        const y = height - (t / max) * (height - 4);
        return <circle key={i} cx={x} cy={y} r="2" fill="#2563eb" />;
      })}
    </svg>
  );
}
