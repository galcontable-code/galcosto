import { useCatalogs } from '../../lib/catalogs';
import { formatComprobante, formatMoney, simboloMoneda } from '../../lib/format';
import type { PreviewResult } from '../../lib/types';
import { Alert, Skeleton, Spinner, cx } from '../../components/ui';

/**
 * Totales del comprobante, calculados por el backend
 * (`POST /api/invoices/preview`) para que coincidan al centavo con lo que se
 * le va a mandar a ARCA.
 */
export function PanelTotales({
  preview,
  cargando,
  error,
  monId,
  ptoVta,
  pegajoso = true,
}: {
  preview: PreviewResult | null;
  cargando: boolean;
  error: string | null;
  monId: string;
  ptoVta: number;
  pegajoso?: boolean;
}): JSX.Element {
  const { descAlicuota, descComprobante } = useCatalogs();
  const simbolo = simboloMoneda(monId);
  const totals = preview?.totals ?? null;

  const linea = (etiqueta: string, valor: number | undefined, fuerte = false): JSX.Element => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={cx(
          'text-sm',
          fuerte
            ? 'font-semibold text-slate-900 dark:text-slate-100'
            : 'text-slate-600 dark:text-slate-400',
        )}
      >
        {etiqueta}
      </span>
      <span
        className={cx(
          'tabular',
          fuerte
            ? 'text-sm font-semibold text-slate-900 dark:text-slate-100'
            : 'text-sm text-slate-700 dark:text-slate-300',
        )}
      >
        {formatMoney(valor, simbolo)}
      </span>
    </div>
  );

  return (
    <aside className={cx('surface p-4', pegajoso && 'lg:sticky lg:top-[4.75rem]')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Totales</h3>
        {cargando ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Spinner className="h-3 w-3" /> calculando
          </span>
        ) : null}
      </div>

      {error ? (
        <Alert tono="rojo" className="mb-3">
          {error}
        </Alert>
      ) : null}

      {!totals && !error ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-9 w-full" />
          <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
            Cargá al menos un ítem para ver los totales.
          </p>
        </div>
      ) : totals ? (
        <div
          className={cx('divide-y divide-slate-100 dark:divide-slate-800', cargando && 'opacity-60')}
          aria-live="polite"
        >
          <div>
            {linea('Neto gravado', totals.impNeto)}
            {totals.impOpEx > 0 ? linea('Operaciones exentas', totals.impOpEx) : null}
            {totals.impTotConc > 0 ? linea('No gravado', totals.impTotConc) : null}
          </div>

          {totals.iva.length > 0 ? (
            <div className="pt-1">
              {totals.iva.map((i) => (
                <div key={i.Id} className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    IVA {descAlicuota(i.Id)}
                    <span className="ml-1.5 text-xs text-slate-400">
                      sobre {formatMoney(i.BaseImp, simbolo)}
                    </span>
                  </span>
                  <span className="text-sm text-slate-700 tabular dark:text-slate-300">
                    {formatMoney(i.Importe, simbolo)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {totals.impTrib > 0 ? <div className="pt-1">{linea('Otros tributos', totals.impTrib)}</div> : null}

          <div className="mt-1 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Total
              </span>
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular dark:text-white">
                {formatMoney(totals.impTotal, simbolo)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <dl className="mt-4 space-y-1.5 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Va a tomar el número</dt>
            <dd className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {formatComprobante(ptoVta, preview.proximoNumero)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500 dark:text-slate-400">Comprobante</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {descComprobante(preview.cbteTipoSugerido)}
            </dd>
          </div>
        </dl>
      ) : null}

      {preview && preview.validaciones.length > 0 ? (
        <Alert tono="ambar" className="mt-3" titulo="Revisá esto antes de emitir">
          <ul className="list-disc space-y-0.5 pl-4">
            {preview.validaciones.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </aside>
  );
}
