import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ArcaEnvironment, ArcaHealth } from '../lib/types';
import { cx } from './ui';

type Estado = 'consultando' | 'ok' | 'caido';

/**
 * Indicador de estado de los servidores de ARCA (FEDummy).
 * Se refresca cada 60 segundos y al cambiar de entorno.
 */
export function ArcaStatus({
  environment,
  compacto = false,
}: {
  environment: ArcaEnvironment;
  compacto?: boolean;
}): JSX.Element {
  const [estado, setEstado] = useState<Estado>('consultando');
  const [detalle, setDetalle] = useState<ArcaHealth | null>(null);

  const consultar = useCallback(async (): Promise<void> => {
    try {
      const health = await api.arcaStatus(environment);
      setDetalle(health);
      setEstado(health.ok ? 'ok' : 'caido');
    } catch {
      setDetalle(null);
      setEstado('caido');
    }
  }, [environment]);

  useEffect(() => {
    let vivo = true;
    const correr = (): void => {
      if (vivo) void consultar();
    };
    setEstado('consultando');
    correr();
    const id = window.setInterval(correr, 60_000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [consultar]);

  const color =
    estado === 'ok'
      ? 'bg-emerald-500'
      : estado === 'caido'
        ? 'bg-red-500'
        : 'bg-slate-400 animate-pulse-soft';

  const texto =
    estado === 'ok' ? 'ARCA operativo' : estado === 'caido' ? 'ARCA sin respuesta' : 'Consultando…';

  const titulo = detalle
    ? `App: ${detalle.appServer} · Base: ${detalle.dbServer} · Auth: ${detalle.authServer}`
    : texto;

  return (
    <button
      type="button"
      onClick={() => void consultar()}
      title={titulo}
      aria-live="polite"
      className={cx(
        'inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
        compacto && 'px-2',
      )}
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-full', color)} />
      {compacto ? <span className="sr-only">{texto}</span> : <span>{texto}</span>}
    </button>
  );
}

/** Badge del entorno: ámbar en homologación, verde en producción. */
export function EntornoBadge({ environment }: { environment: ArcaEnvironment }): JSX.Element {
  const prod = environment === 'PROD';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset',
        prod
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800'
          : 'bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
      )}
      title={
        prod
          ? 'Los comprobantes que emitas tienen validez fiscal.'
          : 'Entorno de pruebas: los comprobantes NO tienen validez fiscal.'
      }
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', prod ? 'bg-emerald-500' : 'bg-amber-500')} />
      {prod ? 'Producción' : 'Homologación'}
    </span>
  );
}
