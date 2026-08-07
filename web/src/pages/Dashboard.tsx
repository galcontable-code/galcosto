import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mensajeDeError } from '../lib/api';
import { api } from '../lib/api';
import { useCompany } from '../lib/company';
import { useCatalogs } from '../lib/catalogs';
import { formatComprobante, formatDate, formatMoney, formatNumber } from '../lib/format';
import { useTitulo } from '../lib/hooks';
import { descargarPdf } from '../lib/pdf';
import { useToast } from '../lib/toast';
import { BarChart, BarraProporcion } from '../components/BarChart';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  EstadoBadge,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '../components/ui';
import {
  IconComprobantes,
  IconDescargar,
  IconFacturar,
  IconOjo,
  IconRayo,
} from '../components/Icons';
import type { DashboardData, Invoice, SerieDiariaPunto } from '../lib/types';

type Periodo = 'mes' | 'anterior' | 'anio';

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: 'mes', label: 'Este mes' },
  { id: 'anterior', label: 'Mes anterior' },
  { id: 'anio', label: 'Este año' },
];

/** El backend puede nombrar los campos de la serie de varias formas. */
function normalizarSerie(serie: unknown): SerieDiariaPunto[] {
  if (!Array.isArray(serie)) return [];
  return serie
    .map((p): SerieDiariaPunto | null => {
      if (typeof p !== 'object' || p === null) return null;
      const o = p as Record<string, unknown>;
      const fecha = o.fecha ?? o.dia ?? o.date ?? o.day;
      const total = o.total ?? o.importe ?? o.monto ?? o.impTotal;
      if (typeof fecha !== 'string') return null;
      const cantidad = typeof o.cantidad === 'number' ? o.cantidad : undefined;
      return {
        fecha,
        total: typeof total === 'number' ? total : 0,
        ...(cantidad === undefined ? {} : { cantidad }),
      };
    })
    .filter((p): p is SerieDiariaPunto => p !== null);
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  acento,
  cargando,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  acento?: 'azul' | 'verde' | 'ambar' | 'gris';
  cargando?: boolean;
}): JSX.Element {
  const barra = {
    azul: 'bg-brand-600',
    verde: 'bg-emerald-500',
    ambar: 'bg-amber-500',
    gris: 'bg-slate-400',
  }[acento ?? 'gris'];

  return (
    <div className="surface relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-1 ${barra}`} />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {titulo}
      </p>
      {cargando ? (
        <Skeleton className="mt-2 h-8 w-32" />
      ) : (
        <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 tabular dark:text-white">
          {valor}
        </p>
      )}
      {detalle ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>
      ) : null}
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  useTitulo('Inicio');
  const { companyId, company } = useCompany();
  const { descComprobante } = useCatalogs();
  const toast = useToast();

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [data, setData] = useState<DashboardData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.dashboard({
        companyId: companyId ?? undefined,
        periodo,
      });
      setData({ ...res, serieDiaria: normalizarSerie(res.serieDiaria) });
    } catch (e) {
      setError(mensajeDeError(e));
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [companyId, periodo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function bajarPdf(inv: Invoice): Promise<void> {
    setDescargando(inv.id);
    try {
      await descargarPdf(
        inv.id,
        inv.numeroFormateado ?? formatComprobante(inv.ptoVta, inv.cbteNro),
      );
    } catch (e) {
      toast.error('No pudimos descargar el PDF', mensajeDeError(e));
    } finally {
      setDescargando(null);
    }
  }

  const ultimas = data?.ultimasFacturas ?? [];
  const porTipo = data?.porTipo ?? [];
  const maxPorTipo = Math.max(1, ...porTipo.map((p) => p.total));

  return (
    <div>
      <PageHeader
        titulo={`Hola${company ? `, ${company.razonSocial}` : ''}`}
        descripcion="Tu resumen de facturación y el acceso rápido a lo que más usás."
        acciones={
          <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                  periodo === p.id
                    ? 'bg-brand-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <Alert
          tono="rojo"
          titulo="No pudimos cargar el resumen"
          className="mb-5"
          acciones={
            <Button variante="secundario" tamano="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {/* CTA principal */}
      <Link
        to="/facturar"
        className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-brand-800 px-5 py-4 text-white shadow-sm transition hover:bg-brand-900 dark:bg-brand-700 dark:hover:bg-brand-600"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <IconRayo className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold">Nueva factura</p>
            <p className="text-sm text-brand-100">
              Tres pasos y el CAE llega en el momento, contra ARCA.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-900">
          <IconFacturar className="h-4 w-4" />
          Empezar
        </span>
      </Link>

      {/* Tarjetas */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta
          titulo="Facturado en el período"
          valor={formatMoney(data?.totalFacturado)}
          detalle="Total de comprobantes emitidos"
          acento="azul"
          cargando={cargando}
        />
        <Tarjeta
          titulo="Comprobantes"
          valor={formatNumber(data?.emitidas)}
          detalle="Emitidos con CAE"
          acento="verde"
          cargando={cargando}
        />
        <Tarjeta
          titulo="IVA liquidado"
          valor={formatMoney(data?.ivaLiquidado)}
          detalle="Débito fiscal del período"
          acento="ambar"
          cargando={cargando}
        />
        <Tarjeta
          titulo="Ticket promedio"
          valor={formatMoney(data?.promedio)}
          detalle="Importe medio por comprobante"
          acento="gris"
          cargando={cargando}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            titulo="Facturación diaria"
            descripcion="Importe total emitido por día en el período seleccionado."
          />
          {cargando ? (
            <Skeleton className="h-[200px] w-full" />
          ) : (
            <BarChart serie={data?.serieDiaria ?? []} />
          )}
        </Card>

        <Card>
          <CardHeader titulo="Por tipo de comprobante" />
          {cargando ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : porTipo.length === 0 ? (
            <EmptyState titulo="Sin datos" descripcion="No hay comprobantes en el período." />
          ) : (
            <ul className="space-y-3.5">
              {porTipo.map((p) => (
                <li key={p.cbteTipo}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {p.descripcion ?? descComprobante(p.cbteTipo)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-slate-900 tabular dark:text-white">
                      {formatMoney(p.total)}
                    </span>
                  </div>
                  <BarraProporcion valor={p.total} max={maxPorTipo} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {formatNumber(p.cantidad)} comprobante{p.cantidad === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          titulo="Últimos comprobantes"
          descripcion="Los más recientes de esta empresa."
          acciones={
            <Link to="/comprobantes">
              <Button variante="secundario" tamano="sm">
                Ver todos
              </Button>
            </Link>
          }
        />

        {cargando ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ultimas.length === 0 ? (
          <EmptyState
            titulo="Todavía no emitiste comprobantes"
            descripcion="Cuando emitas el primero lo vas a ver acá, con acceso directo al PDF."
            icono={<IconComprobantes className="h-8 w-8" />}
            accion={
              <Link to="/facturar">
                <Button iconoIzq={<IconFacturar className="h-4 w-4" />}>Emitir el primero</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th align="right">Total</Th>
                <Th>Estado</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {ultimas.map((inv) => (
                <Tr key={inv.id}>
                  <Td className="font-mono text-xs font-semibold">
                    <Link to={`/comprobantes/${inv.id}`} className="link">
                      {inv.numeroFormateado ?? formatComprobante(inv.ptoVta, inv.cbteNro)}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(inv.fechaCbte)}</Td>
                  <Td className="max-w-[16rem] truncate">
                    {inv.receptorRazonSocial ?? inv.customer?.razonSocial ?? 'Consumidor final'}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {inv.descripcionComprobante ?? descComprobante(inv.cbteTipo)}
                  </Td>
                  <Td align="right" className="font-semibold">
                    {formatMoney(inv.impTotal)}
                  </Td>
                  <Td>
                    <EstadoBadge estado={inv.estado} />
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Link to={`/comprobantes/${inv.id}`}>
                        <Button variante="fantasma" tamano="sm" aria-label="Ver detalle">
                          <IconOjo className="h-4 w-4" />
                        </Button>
                      </Link>
                      {inv.estado === 'EMITIDA' ? (
                        <Button
                          variante="fantasma"
                          tamano="sm"
                          aria-label="Descargar PDF"
                          cargando={descargando === inv.id}
                          onClick={() => void bajarPdf(inv)}
                        >
                          {descargando === inv.id ? null : <IconDescargar className="h-4 w-4" />}
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
