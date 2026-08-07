import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTipo = 'exito' | 'error' | 'info' | 'aviso';

export interface Toast {
  id: number;
  tipo: ToastTipo;
  titulo: string;
  detalle?: string;
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void;
  exito: (titulo: string, detalle?: string) => void;
  error: (titulo: string, detalle?: string) => void;
  info: (titulo: string, detalle?: string) => void;
  aviso: (titulo: string, detalle?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ESTILOS: Record<ToastTipo, string> = {
  exito:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  error:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
  info: 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100',
  aviso:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
};

function IconoToast({ tipo }: { tipo: ToastTipo }): JSX.Element {
  const comun = 'h-5 w-5 shrink-0';
  if (tipo === 'exito') {
    return (
      <svg className={comun} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (tipo === 'error') {
    return (
      <svg className={comun} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className={comun} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v5a1 1 0 11-2 0V9zm1-4.2a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const siguienteId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = siguienteId.current++;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tipo === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss,
      exito: (titulo, detalle) => push({ tipo: 'exito', titulo, detalle }),
      error: (titulo, detalle) => push({ tipo: 'error', titulo, detalle }),
      info: (titulo, detalle) => push({ tipo: 'info', titulo, detalle }),
      aviso: (titulo, detalle) => push({ tipo: 'aviso', titulo, detalle }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notificaciones"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex animate-slide-in items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${ESTILOS[t.tipo]}`}
          >
            <IconoToast tipo={t.tipo} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.titulo}</p>
              {t.detalle ? (
                <p className="mt-0.5 break-words text-xs opacity-90">{t.detalle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
              aria-label="Cerrar notificación"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M6.3 5a.9.9 0 00-1.3 1.3L8.7 10l-3.7 3.7A.9.9 0 106.3 15L10 11.3 13.7 15a.9.9 0 001.3-1.3L11.3 10 15 6.3A.9.9 0 0013.7 5L10 8.7 6.3 5z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast tiene que usarse dentro de <ToastProvider>');
  return ctx;
}
