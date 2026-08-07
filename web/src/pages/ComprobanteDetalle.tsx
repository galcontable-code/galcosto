/**
 * Detalle de un comprobante: datos fiscales, items, CAE, QR y la respuesta
 * cruda de ARCA para soporte.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ArcaLog, ArcaObservacion, Invoice } from '../lib/types';
import { api, mensajeDeError } from '../lib/api';
import { useCatalogs, discriminaIva, esNotaDeCredito } from '../lib/catalogs';
import { useToast } from '../lib/toast';
import { useTitulo } from '../lib/hooks';
import { descargarPdf } from '../lib/pdf';
import { Modal } from '../components/Modal';
import { Qr } from '../components/Qr';
import {
  Alert, Badge, Button, Card, CardHeader, EstadoBadge, Skeleton,
  Table, Td, Th, Tr,
} from '../components/ui';
import {
  IconDescargar, IconFlechaIzq, IconNotaCredito, IconReintentar,
} from '../components/Icons';
import {
  diasHasta, formatComprobante, formatCuit, formatDate, formatMoney, formatPercent, simboloMoneda,
} from '../lib/format';

/** Las observaciones pueden venir como JSON string desde la base. */
function comoObservaciones(v: ArcaObservacion[] | string | null | undefined): ArcaObservacion[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as ArcaObservacion[]) : [];
  } catch {
    return [];
  }
}

export function ComprobanteDetallePage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { descComprobante, descCondicionIva, descAlicuota, descConcepto } = useCatalogs();

  const [inv, setInv] = useState<Invoice | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<'pdf' | 'nc' | 'retry' | null>(null);
  const [confirmarNc, setConfirmarNc] = useState(false);
  const [motivoNc, setMotivoNc] = useState('');
  const [log, setLog] = useState<ArcaLog | null>(null);
  const [verLog, setVerLog] = useState(false);

  useTitulo(inv?.numeroFormateado ? `Comprobante ${inv.numeroFormateado}` : 'Comprobante');

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    api
      .invoice(id)
      .then((r) => { setInv(r); setError(null); })
      .catch((e: unknown) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(cargar, [cargar]);

  const numero = inv ? inv.numeroFormateado ?? formatComprobante(inv.ptoVta, inv.cbteNro) : '';

  async function bajarPdf(): Promise<void> {
    if (!inv) return;
    setAccion('pdf');
    try {
      await descargarPdf(inv.id, numero);
    } catch (e) {
      toast.error('No pudimos descargar el PDF', mensajeDeError(e));
    } finally {
      setAccion(null);
    }
  }

  async function emitirNc(): Promise<void> {
    if (!inv) return;
    setAccion('nc');
    try {
      const nc = await api.creditNote(inv.id, { motivo: motivoNc.trim() || undefined });
      toast.exito(`Nota de credito ${nc.numeroFormateado ?? ''} emitida`, nc.cae ? `CAE ${nc.cae}` : undefined);
      setConfirmarNc(false);
      navigate(`/comprobantes/${nc.id}`);
    } catch (e) {
      toast.error('No se pudo emitir la nota de credito', mensajeDeError(e));
    } finally {
      setAccion(null);
    }
  }

  async function reintentar(): Promise<void> {
    if (!inv) return;
    setAccion('retry');
    try {
      const r = await api.retryInvoice(inv.id);
      setInv(r);
      toast.exito('Comprobante emitido', r.cae ? `CAE ${r.cae}` : undefined);
    } catch (e) {
      toast.error('ARCA volvio a rechazar el comprobante', mensajeDeError(e));
      cargar();
    } finally {
      setAccion(null);
    }
  }

  async function abrirLog(): Promise<void> {
    setVerLog(true);
    if (log || !inv) return;
    try {
      setLog(await api.arcaLog(inv.id));
    } catch (e) {
      toast.error('No pudimos traer el intercambio con ARCA', mensajeDeError(e));
    }
  }

  if (cargando) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !inv) {
    return (
      <Alert tono="rojo" titulo="No pudimos abrir el comprobante"
        acciones={<Button tamano="sm" onClick={() => navigate('/comprobantes')}>Volver al listado</Button>}>
        {error ?? 'El comprobante no existe o no pertenece a este estudio.'}
      </Alert>
    );
  }

  const simbolo = simboloMoneda(inv.monId);
  const discrimina = discriminaIva(inv.cbteTipo);
  const observaciones = comoObservaciones(inv.observaciones);
  const errores = comoObservaciones(inv.arcaErrors);
  const dias = diasHasta(inv.caeVto);
  const esNc = esNotaDeCredito(inv.cbteTipo);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/comprobantes"
            className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
            <IconFlechaIzq className="h-4 w-4" /> Comprobantes
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={inv.letra === 'A' ? 'azul' : inv.letra === 'B' ? 'violeta' : 'gris'}>
              {inv.letra ?? '-'}
            </Badge>
            <h1 className="tabular text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">{numero}</h1>
            <EstadoBadge estado={inv.estado} />
            {inv.environment === 'HOMO' ? <Badge tono="ambar">Homologacion</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {inv.descripcionComprobante ?? descComprobante(inv.cbteTipo)} · {formatDate(inv.fechaCbte)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {inv.estado === 'EMITIDA' ? (
            <Button variante="secundario" onClick={() => void bajarPdf()} cargando={accion === 'pdf'}
              iconoIzq={<IconDescargar className="h-4 w-4" />}>
              Descargar PDF
            </Button>
          ) : null}
          {inv.estado === 'EMITIDA' && !esNc ? (
            <Button variante="secundario" onClick={() => setConfirmarNc(true)}
              iconoIzq={<IconNotaCredito className="h-4 w-4" />}>
              Nota de credito
            </Button>
          ) : null}
          {inv.estado === 'RECHAZADA' || inv.estado === 'BORRADOR' ? (
            <Button onClick={() => void reintentar()} cargando={accion === 'retry'}
              iconoIzq={<IconReintentar className="h-4 w-4" />}>
              Reintentar emision
            </Button>
          ) : null}
        </div>
      </div>

      {errores.length > 0 ? (
        <Alert tono="rojo" titulo="ARCA rechazo el comprobante" className="mb-4">
          <ul className="list-disc space-y-1 pl-5">
            {errores.map((e, i) => (
              <li key={i}><span className="tabular font-semibold">[{e.code}]</span> {e.msg}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {observaciones.length > 0 ? (
        <Alert tono="ambar" titulo="Observaciones de ARCA" className="mb-4">
          <ul className="list-disc space-y-1 pl-5">
            {observaciones.map((o, i) => (
              <li key={i}><span className="tabular font-semibold">[{o.code}]</span> {o.msg}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* Emisor y receptor */}
          <Card padding={false}>
            <div className="grid gap-0 sm:grid-cols-2">
              <div className="p-4 sm:p-5">
                <p className="lbl mb-2">Emisor</p>
                <p className="font-semibold text-slate-900 dark:text-white">{inv.company?.razonSocial ?? '—'}</p>
                <dl className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                  <Dato t="CUIT" v={inv.company ? formatCuit(inv.company.cuit) : '—'} />
                  <Dato t="Domicilio" v={inv.company?.domicilio ?? '—'} />
                  <Dato t="Ing. Brutos" v={inv.company?.ingresosBrutos ?? '—'} />
                </dl>
              </div>
              <div className="border-t border-slate-200 p-4 sm:border-l sm:border-t-0 sm:p-5 dark:border-slate-800">
                <p className="lbl mb-2">Receptor</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {inv.receptorRazonSocial ?? inv.customer?.razonSocial ?? 'Consumidor final'}
                </p>
                <dl className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                  <Dato t="Documento" v={inv.docTipo === 80 ? formatCuit(inv.docNro) : inv.docNro} />
                  <Dato t="Cond. IVA" v={descCondicionIva(inv.condicionIvaReceptorId)} />
                  <Dato t="Domicilio" v={inv.receptorDomicilio ?? inv.customer?.domicilio ?? '—'} />
                </dl>
              </div>
            </div>
          </Card>

          {/* Items */}
          <Card padding={false}>
            <CardHeader titulo="Detalle" />
            <Table>
              <thead>
                <tr>
                  <Th>Descripcion</Th>
                  <Th align="right">Cant.</Th>
                  <Th align="right">P. unitario</Th>
                  {discrimina ? <Th align="right">IVA</Th> : null}
                  <Th align="right">Subtotal</Th>
                </tr>
              </thead>
              <tbody>
                {(inv.items ?? []).map((it) => (
                  <Tr key={it.id}>
                    <Td>
                      <span className="block">{it.descripcion}</span>
                      {it.bonificacion ? (
                        <span className="block text-xs text-emerald-600">
                          Bonificacion {formatPercent(it.bonificacion)}
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right" className="tabular">{it.cantidad} {it.unidad}</Td>
                    <Td align="right" className="tabular">{formatMoney(it.precioUnitario, simbolo)}</Td>
                    {discrimina ? (
                      <Td align="right" className="tabular text-slate-500">{descAlicuota(it.ivaId)}</Td>
                    ) : null}
                    <Td align="right" className="tabular font-medium">
                      {formatMoney(discrimina ? it.subtotalNeto : it.subtotalConIva, simbolo)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            <dl className="ml-auto max-w-xs space-y-1.5 border-t border-slate-200 p-4 text-sm sm:p-5 dark:border-slate-800">
              {discrimina ? (
                <>
                  <Total t="Subtotal neto" v={formatMoney(inv.impNeto, simbolo)} />
                  <Total t="IVA" v={formatMoney(inv.impIVA, simbolo)} />
                </>
              ) : null}
              {inv.impTrib ? <Total t="Otros tributos" v={formatMoney(inv.impTrib, simbolo)} /> : null}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                <dt>Total</dt>
                <dd className="tabular">{formatMoney(inv.impTotal, simbolo)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader titulo="Datos del comprobante" />
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <Dato t="Concepto" v={descConcepto(inv.concepto)} />
              <Dato t="Punto de venta" v={String(inv.ptoVta).padStart(4, '0')} />
              <Dato t="Moneda" v={`${inv.monId} (cotiz. ${inv.monCotiz})`} />
              {inv.fchServDesde ? <Dato t="Periodo desde" v={formatDate(inv.fchServDesde)} /> : null}
              {inv.fchServHasta ? <Dato t="Periodo hasta" v={formatDate(inv.fchServHasta)} /> : null}
              {inv.fchVtoPago ? <Dato t="Vto. de pago" v={formatDate(inv.fchVtoPago)} /> : null}
            </dl>
            <div className="mt-4">
              <Button variante="fantasma" tamano="sm" onClick={() => void abrirLog()}>
                Ver respuesta de ARCA
              </Button>
            </div>
          </Card>
        </div>

        {/* CAE + QR */}
        <div className="space-y-4">
          {inv.cae ? (
            <Card className="text-center">
              <p className="lbl">CAE</p>
              <p className="tabular mt-1 break-all text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {inv.cae}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Vence el {formatDate(inv.caeVto)}
                {dias !== null ? (
                  <span className={dias < 0 ? 'text-red-500' : dias <= 3 ? 'text-amber-500' : ''}>
                    {' '}({dias < 0 ? 'vencido' : `en ${dias} dia${dias === 1 ? '' : 's'}`})
                  </span>
                ) : null}
              </p>
              {inv.qrUrl || inv.qrPayload ? (
                <div className="mt-4 flex justify-center">
                  <Qr invoiceId={inv.id} url={inv.qrUrl ?? inv.qrPayload} tamano={150} />
                </div>
              ) : null}
              {inv.environment === 'HOMO' ? (
                <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Comprobante de prueba — sin validez fiscal
                </p>
              ) : null}
            </Card>
          ) : (
            <Card className="text-center">
              <p className="text-sm text-slate-500">Este comprobante todavia no tiene CAE.</p>
            </Card>
          )}
        </div>
      </div>

      <Modal abierto={confirmarNc} onClose={() => setConfirmarNc(false)}
        titulo="Emitir nota de credito"
        descripcion={`Se va a emitir la nota de credito que anula ${numero}, con el comprobante original asociado.`}
        footer={
          <>
            <Button variante="secundario" onClick={() => setConfirmarNc(false)}>Cancelar</Button>
            <Button onClick={() => void emitirNc()} cargando={accion === 'nc'}>Emitir nota de credito</Button>
          </>
        }
      >
        <label className="lbl" htmlFor="motivo-nc">Motivo (opcional)</label>
        <textarea id="motivo-nc" rows={3} value={motivoNc} onChange={(e) => setMotivoNc(e.target.value)}
          placeholder="Anulacion por error de facturacion"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
      </Modal>

      <Modal abierto={verLog} onClose={() => setVerLog(false)} ancho="xl"
        titulo="Intercambio con ARCA"
        descripcion="Lo que se envio y lo que respondio ARCA. Sirve para soporte cuando un comprobante se rechaza.">
        {log ? (
          <div className="space-y-3">
            <LogBloque titulo="Enviado" contenido={log.request ?? log.arcaRequest} />
            <LogBloque titulo="Recibido" contenido={log.response ?? log.arcaResponse} />
          </div>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </Modal>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }): JSX.Element {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-slate-500">{t}:</dt>
      <dd className="min-w-0 truncate text-slate-800 dark:text-slate-200">{v}</dd>
    </div>
  );
}

function Total({ t, v }: { t: string; v: string }): JSX.Element {
  return (
    <div className="flex justify-between text-slate-600 dark:text-slate-400">
      <dt>{t}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}

function LogBloque({ titulo, contenido }: { titulo: string; contenido?: string | null }): JSX.Element {
  return (
    <div>
      <p className="lbl mb-1">{titulo}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
        {contenido?.trim() || 'Sin datos registrados.'}
      </pre>
    </div>
  );
}
