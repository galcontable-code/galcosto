import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompany } from '../lib/company';
import { formatCuit, iniciales } from '../lib/format';
import { useCerrarAlClickAfuera } from '../lib/hooks';
import { IconCheck, IconChevron, IconEmpresas, IconMas } from './Icons';
import { cx } from './ui';

/** Selector de empresa emisora. Siempre visible: el estudio factura por varios CUIT. */
export function CompanySwitcher(): JSX.Element {
  const { companies, company, seleccionar, cargando } = useCompany();
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  const ref = useCerrarAlClickAfuera(abierto, cerrar);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="flex w-full min-w-0 max-w-[19rem] items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-left transition hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-700 text-[11px] font-bold text-white">
          {company ? iniciales(company.razonSocial) : <IconEmpresas className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
            {cargando && !company
              ? 'Cargando empresas…'
              : (company?.razonSocial ?? 'Sin empresa emisora')}
          </span>
          <span className="block truncate text-[11px] leading-tight text-slate-500 tabular dark:text-slate-400">
            {company ? formatCuit(company.cuit) : 'Cargá una para empezar a facturar'}
          </span>
        </span>
        <IconChevron className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {abierto ? (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1 max-h-96 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-in overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Empresa emisora
          </p>
          {companies.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-slate-500 dark:text-slate-400">
              Todavía no hay empresas cargadas.
            </p>
          ) : (
            companies.map((c) => {
              const activa = c.id === company?.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={activa}
                  onClick={() => {
                    seleccionar(c.id);
                    cerrar();
                  }}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition',
                    activa
                      ? 'bg-brand-50 dark:bg-brand-950'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {iniciales(c.razonSocial)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {c.razonSocial}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500 tabular dark:text-slate-400">
                      {formatCuit(c.cuit)} · {c.environment === 'PROD' ? 'Producción' : 'Homologación'}
                      {c.hasCredentials === false ? ' · sin certificado' : ''}
                    </span>
                  </span>
                  {activa ? <IconCheck className="h-4 w-4 shrink-0 text-brand-600" /> : null}
                </button>
              );
            })
          )}
          <div className="mt-1 border-t border-slate-200 pt-1 dark:border-slate-700">
            <Link
              to="/empresas"
              onClick={cerrar}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-brand-700 transition hover:bg-slate-100 dark:text-brand-300 dark:hover:bg-slate-800"
            >
              <IconMas className="h-4 w-4" />
              Administrar empresas
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
