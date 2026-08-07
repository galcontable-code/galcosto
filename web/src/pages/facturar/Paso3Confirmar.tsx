import { discriminaIva, letraDeComprobante, useCatalogs } from '../../lib/catalogs';
import {
  formatComprobante,
  formatCuit,
  formatDate,
  formatMoney,
  formatPercent,
  simboloMoneda,
} from '../../lib/format';
import type { Company, PreviewResult } from '../../lib/types';
import { Badge, Card, Table, Td, Th, Tr } from '../../components/ui';
import { EntornoBadge } from '../../components/ArcaStatus';
import { itemsUtiles, type WizardState } from './state';

/**
 * Vista previa del comprobante tal como va a salir impreso, antes de pedir
 * el CAE. Es la última oportunidad de detectar un error de carga.
 */
export function Paso3Confirmar({
  state,
  company,
  preview,
}: {
  state: WizardState;
  company: Company;
  preview: PreviewResult | null;
}): JSX.Element {
  const { descComprobante, descCondicionIva, descConcepto, descAlicuota, alicuota } =
    useCatalogs();

  const cbteTipo = state.cbteTipo ?? preview?.cbteTipoSugerido ?? 11;
  const letra = letraDeComprobante(cbteTipo);
  const discrimina = discriminaIva(cbteTipo);
  const simbolo = simboloMoneda(state.monId);
  const items = itemsUtiles(state);
  const totals = preview?.totals;

  return (
    <Card padding={false} className="overflow-hidden">
      {/* Encabezado tipo factura */}
      <div className="grid gap-0 border-b border-slate-200 sm:grid-cols-2 dark:border-slate-800">
        <div className="p-5">
          <p className="text-lg font-bold text-slate-900 dark:text-white">{company.razonSocial}</p>
          <dl className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex gap-1.5">
              <dt className="font-medium">CUIT:</dt>
              <dd className="tabular">{formatCuit(company.cuit)}</dd>
            </div>
            {company.domicilio ? (
              <div className="flex gap-1.5">
                <dt className="font-medium">Domicilio:</dt>
                <dd>
                  {[company.domicilio, company.localidad, company.provincia]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            ) : null}
            {company.ingresosBrutos ? (
              <div className="flex gap-1.5">
                <dt className="font-medium">IIBB:</dt>
                <dd>{company.ingresosBrutos}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt className="font-medium">Condición IVA:</dt>
              <dd>
                {company.condicionIva === 'RI'
                  ? 'Responsable Inscripto'
                  : company.condicionIva === 'MONOTRIBUTO'
                    ? 'Responsable Monotributo'
                    : 'Sujeto Exento'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-5 sm:border-l sm:border-t-0 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {descComprobante(cbteTipo)}
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular dark:text-white">
                {preview
                  ? formatComprobante(state.ptoVta, preview.proximoNumero)
                  : `${String(state.ptoVta).padStart(4, '0')}-········`}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Número que va a tomar en ARCA
              </p>
            </div>
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-slate-300 text-2xl font-black text-slate-700 dark:border-slate-600 dark:text-slate-200"
              aria-label={`Comprobante clase ${letra}`}
            >
              {letra}
            </span>
          </div>

          <dl className="mt-3 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex justify-between gap-2">
              <dt>Fecha</dt>
              <dd className="font-medium tabular">{formatDate(state.fechaCbte)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Concepto</dt>
              <dd className="font-medium">{descConcepto(state.concepto)}</dd>
            </div>
            {state.concepto !== 1 ? (
              <>
                <div className="flex justify-between gap-2">
                  <dt>Período facturado</dt>
                  <dd className="font-medium tabular">
                    {formatDate(state.fchServDesde)} — {formatDate(state.fchServHasta)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Vencimiento de pago</dt>
                  <dd className="font-medium tabular">{formatDate(state.fchVtoPago)}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt>Moneda</dt>
              <dd className="font-medium">
                {state.monId}
                {state.monId !== 'PES' ? ` · cotiz. ${state.monCotiz}` : ''}
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <EntornoBadge environment={company.environment} />
          </div>
        </div>
      </div>

      {/* Receptor */}
      <div className="border-b border-slate-200 p-5 dark:border-slate-800">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Receptor
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {state.receptorRazonSocial || 'Consumidor Final'}
          </p>
          <p className="text-sm text-slate-600 tabular dark:text-slate-400">
            {state.docTipo === 99
              ? 'Consumidor final'
              : `${state.docTipo === 80 ? 'CUIT' : state.docTipo === 86 ? 'CUIL' : 'DNI'} ${
                  state.docTipo === 80 || state.docTipo === 86
                    ? formatCuit(state.docNro)
                    : state.docNro
                }`}
          </p>
          <Badge tono="contorno">{descCondicionIva(state.condicionIvaReceptorId)}</Badge>
        </div>
        {state.receptorDomicilio ? (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {state.receptorDomicilio}
          </p>
        ) : null}
      </div>

      {/* Ítems */}
      <div className="px-5 pt-4">
        <Table>
          <thead>
            <tr>
              <Th>Descripción</Th>
              <Th align="right">Cant.</Th>
              <Th align="right">P. unit.</Th>
              <Th align="right">Bonif.</Th>
              {discrimina ? <Th align="right">IVA</Th> : null}
              <Th align="right">Subtotal</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => {
              const calculado = totals?.items?.[idx];
              const bruto = i.cantidad * i.precioUnitario * (1 - i.bonificacion / 100);
              const subtotal = calculado
                ? discrimina
                  ? calculado.subtotalConIva
                  : calculado.subtotalNeto
                : bruto;
              return (
                <Tr key={i.key}>
                  <Td className="max-w-[22rem]">{i.descripcion}</Td>
                  <Td align="right">
                    {i.cantidad} {i.unidad !== 'unidad' ? i.unidad : ''}
                  </Td>
                  <Td align="right">{formatMoney(i.precioUnitario, simbolo)}</Td>
                  <Td align="right">
                    {i.bonificacion > 0 ? formatPercent(i.bonificacion) : '—'}
                  </Td>
                  {discrimina ? (
                    <Td align="right">{descAlicuota(i.ivaId) || formatPercent(alicuota(i.ivaId))}</Td>
                  ) : null}
                  <Td align="right" className="font-semibold">
                    {formatMoney(subtotal, simbolo)}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      {/* Totales */}
      <div className="flex flex-col items-end gap-1 px-5 py-4">
        <div className="w-full max-w-xs space-y-1">
          <Fila etiqueta="Neto" valor={formatMoney(totals?.impNeto, simbolo)} />
          {(totals?.iva ?? []).map((i) => (
            <Fila
              key={i.Id}
              etiqueta={`IVA ${descAlicuota(i.Id)}`}
              valor={formatMoney(i.Importe, simbolo)}
            />
          ))}
          {totals && totals.impTrib > 0 ? (
            <Fila etiqueta="Otros tributos" valor={formatMoney(totals.impTrib, simbolo)} />
          ) : null}
          <div className="flex items-baseline justify-between gap-3 border-t border-slate-300 pt-2 dark:border-slate-700">
            <span className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Total
            </span>
            <span className="text-2xl font-bold tracking-tight text-slate-900 tabular dark:text-white">
              {formatMoney(totals?.impTotal, simbolo)}
            </span>
          </div>
        </div>
      </div>

      {state.observaciones ? (
        <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <span className="font-medium">Observaciones: </span>
          {state.observaciones}
        </div>
      ) : null}
    </Card>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-slate-600 dark:text-slate-400">{etiqueta}</span>
      <span className="text-sm text-slate-800 tabular dark:text-slate-200">{valor}</span>
    </div>
  );
}
