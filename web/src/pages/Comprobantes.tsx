/**
 * Listado de comprobantes emitidos, con filtros y paginado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Invoice, Paginated } from '../lib/types';
import { api, mensajeDeError } from '../lib/api';
import { useCompany } from '../lib/company';
import { useCatalogs } from '../lib/catalogs';
import { useToast } from '../lib/toast';
import { useDebounced, useTitulo } from '../lib/hooks';
import { descargarPdf } from '../lib/pdf';
import {
  Alert, Badge, Button, Card, EmptyState, EstadoBadge, Field, Input,
  PageHeader, Select, Skeleton, Table, Td, Th, Tr,
} from '../components/ui';
import {
  IconBuscar, IconComprobantes, IconDescargar, IconFlechaDer, IconFlechaIzq, IconOjo,
} from '../components/Icons';
import { formatDate, formatMoney, formatComprobante, rangoDelMes, simboloMoneda } from '../lib/format';

const TAMANO_PAGINA = 20;

export function ComprobantesPage(): JSX.Element {
  useTitulo('Comprobantes');
  const { companyId } = useCompany();
  const { descComprobante } = useCatalogs();
  const toast = useToast();
  const navigate = useNavigate();

  const mes = useMemo(() => rangoDelMes(), []);
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const search = useDebounced(busqueda, 350);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<Invoice> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState<string | null>(null);

  useEffect(() => setPage(1), [estado, desde, hasta, search, companyId]);

  const cargar = useCallback(() => {
    setCargando(true);
    api
      .invoices({
        companyId: companyId ?? undefined,
        estado: estado || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        search: search || undefined,
        page,
        pageSize: TAMANO_PAGINA,
      })
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false));
  }, [companyId, estado, desde, hasta, search, page]);

  useEffect(cargar, [cargar]);

  async function bajar(inv: Invoice): Promise<void> {
    const nombre = inv.numeroFormateado ?? formatComprobante(inv.ptoVta, inv.cbteNro);
    setBajando(inv.id);
    try {
      await descargarPdf(inv.id, nombre);
    } catch (e) {
      toast.error('No pudimos descargar el PDF', mensajeDeError(e));
    } finally {
      setBajando(null);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const ultimaPagina = Math.max(1, Math.ceil(total / TAMANO_PAGINA));
  const hayFiltros = Boolean(estado || desde || hasta || search);

  return (
    <div>
      <PageHeader
        titulo="Comprobantes"
        descripcion={total > 0 ? `${total} comprobante${total === 1 ? '' : 's'}` : undefined}
        acciones={<Button onClick={() => navigate('/facturar')}>Nueva factura</Button>}
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Buscar" className="lg:col-span-2">
            <div className="relative">
              <IconBuscar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Numero, cliente o CUIT"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="EMITIDA">Emitida</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="BORRADOR">Borrador</option>
              <option value="ANULADA">Anulada</option>
            </Select>
          </Field>
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
        </div>
        {hayFiltros ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variante="fantasma"
              tamano="sm"
              onClick={() => {
                setEstado(''); setDesde(''); setHasta(''); setBusqueda('');
              }}
            >
              Limpiar filtros
            </Button>
            <Button
              variante="fantasma"
              tamano="sm"
              onClick={() => { setDesde(mes.desde); setHasta(mes.hasta); }}
            >
              Este mes
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              variante="fantasma"
              tamano="sm"
              onClick={() => { setDesde(mes.desde); setHasta(mes.hasta); }}
            >
              Ver solo este mes
            </Button>
          </div>
        )}
      </Card>

      {error ? (
        <Alert tono="rojo" titulo="No pudimos cargar los comprobantes" className="mb-4"
          acciones={<Button tamano="sm" onClick={cargar}>Reintentar</Button>}>
          {error}
        </Alert>
      ) : null}

      <Card padding={false}>
        {cargando && items.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            className="py-12"
            icono={<IconComprobantes className="h-6 w-6" />}
            titulo={hayFiltros ? 'Ningun comprobante coincide' : 'Todavia no emitiste comprobantes'}
            descripcion={
              hayFiltros
                ? 'Probá ajustando los filtros o el texto de busqueda.'
                : 'Cuando emitas tu primera factura la vas a ver aca.'
            }
            accion={<Button onClick={() => navigate('/facturar')}>Emitir la primera</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Comprobante</Th>
                <Th>Fecha</Th>
                <Th>Receptor</Th>
                <Th>Estado</Th>
                <Th align="right">Total</Th>
                <Th align="right">CAE</Th>
                <Th align="right"><span className="sr-only">Acciones</span></Th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <Tr key={inv.id} onClick={() => navigate(`/comprobantes/${inv.id}`)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Badge tono={inv.letra === 'A' ? 'azul' : inv.letra === 'B' ? 'violeta' : 'gris'}>
                        {inv.letra ?? '-'}
                      </Badge>
                      <div className="min-w-0">
                        <span className="tabular block font-semibold text-slate-900 dark:text-white">
                          {inv.numeroFormateado ?? formatComprobante(inv.ptoVta, inv.cbteNro)}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {inv.descripcionComprobante ?? descComprobante(inv.cbteTipo)}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td className="tabular whitespace-nowrap">{formatDate(inv.fechaCbte)}</Td>
                  <Td>
                    <span className="block max-w-[220px] truncate">
                      {inv.receptorRazonSocial ?? inv.customer?.razonSocial ?? '—'}
                    </span>
                    <span className="tabular block text-xs text-slate-500">{inv.docNro}</span>
                  </Td>
                  <Td><EstadoBadge estado={inv.estado} /></Td>
                  <Td align="right" className="tabular font-semibold whitespace-nowrap">
                    {formatMoney(inv.impTotal, simboloMoneda(inv.monId))}
                  </Td>
                  <Td align="right" className="tabular text-xs text-slate-500 whitespace-nowrap">
                    {inv.cae ?? '—'}
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/comprobantes/${inv.id}`} title="Ver detalle"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                        <IconOjo className="h-4 w-4" />
                      </Link>
                      {inv.estado === 'EMITIDA' ? (
                        <button type="button" title="Descargar PDF" disabled={bajando === inv.id}
                          onClick={() => void bajar(inv)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-white">
                          <IconDescargar className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {ultimaPagina > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Pagina {page} de {ultimaPagina}
          </p>
          <div className="flex gap-2">
            <Button variante="secundario" tamano="sm" disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)} iconoIzq={<IconFlechaIzq className="h-4 w-4" />}>
              Anterior
            </Button>
            <Button variante="secundario" tamano="sm" disabled={page >= ultimaPagina}
              onClick={() => setPage((p) => p + 1)} iconoDer={<IconFlechaDer className="h-4 w-4" />}>
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
