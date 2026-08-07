import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button, cx } from './ui';
import { IconAlerta, IconCerrar } from './Icons';

/**
 * Modal accesible: cierra con Escape, atrapa el foco básico y bloquea el
 * scroll del fondo mientras está abierto.
 */
export function Modal({
  abierto,
  onClose,
  titulo,
  descripcion,
  children,
  footer,
  ancho = 'md',
}: {
  abierto: boolean;
  onClose: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
}): JSX.Element | null {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const foco = contenedor.current?.querySelector<HTMLElement>(
        'input:not([type=hidden]), select, textarea, button',
      );
      foco?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowPrevio;
      window.clearTimeout(t);
    };
  }, [abierto, onClose]);

  if (!abierto) return null;

  const anchos = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={contenedor}
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === 'string' ? titulo : undefined}
        className={cx(
          'relative z-10 w-full animate-fade-in rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-xl dark:border-slate-800 dark:bg-slate-900',
          anchos[ancho],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{titulo}</h2>
            {descripcion ? (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <IconCerrar className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Confirmación destructiva o de alto impacto. */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  confirmar = 'Confirmar',
  cancelar = 'Cancelar',
  tono = 'peligro',
  cargando = false,
  onConfirm,
  onClose,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: ReactNode;
  confirmar?: string;
  cancelar?: string;
  tono?: 'peligro' | 'primario';
  cargando?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): JSX.Element | null {
  return (
    <Modal
      abierto={abierto}
      onClose={onClose}
      titulo={titulo}
      ancho="sm"
      footer={
        <>
          <Button variante="secundario" onClick={onClose} disabled={cargando}>
            {cancelar}
          </Button>
          <Button variante={tono} onClick={onConfirm} cargando={cargando}>
            {confirmar}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            tono === 'peligro'
              ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300'
              : 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
          )}
        >
          <IconAlerta className="h-5 w-5" />
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300">{mensaje}</div>
      </div>
    </Modal>
  );
}
