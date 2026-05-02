import { useEffect, useRef } from 'react';
import { appendWsToken } from '../api/authFetch';

export interface UseWebSocketOptions {
  url: string;
  onMessage: (msg: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnectDelayMs?: number;
  fallbackPollMs?: number;
  fallbackPoll?: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  reconnectDelayMs = 3000,
  fallbackPollMs = 10000,
  fallbackPoll,
}: UseWebSocketOptions): void {
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const fallbackPollRef = useRef(fallbackPoll);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { fallbackPollRef.current = fallbackPoll; }, [fallbackPoll]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const clearReconnect = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
    const clearFallback = () => {
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    };

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(url);

      ws.onmessage = (e) => {
        try {
          onMessageRef.current(JSON.parse(e.data));
        } catch {
          // mesaj JSON değilse sessizce yut
        }
      };

      ws.onopen = () => {
        clearReconnect();
        clearFallback();
        onOpenRef.current?.();
      };

      ws.onclose = () => {
        if (cancelled) return;
        if (!fallbackInterval && fallbackPollRef.current) {
          fallbackInterval = setInterval(() => fallbackPollRef.current?.(), fallbackPollMs);
        }
        onCloseRef.current?.();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, reconnectDelayMs);
        }
      };

      ws.onerror = () => { ws?.close(); };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      clearFallback();
      ws?.close();
    };
  }, [url, reconnectDelayMs, fallbackPollMs]);
}

export function buildWebSocketUrl(apiBase: string = ''): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const base = apiBase ? apiBase.replace(/^http/, 'ws') : `${proto}://${window.location.host}`;
  return appendWsToken(`${base}/ws`);
}
