import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Toast } from '../components/Toast';

interface ToastNotification {
  msg: string;
  error?: boolean;
}

interface ToastContextValue {
  showToast: (msg: string, error?: boolean) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<ToastNotification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, error = false) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification({ msg, error });
    timerRef.current = setTimeout(() => setNotification(null), error ? 7000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast notification={notification} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
