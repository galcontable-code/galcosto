import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mensajeDeError } from '../../lib/api';
import { useCatalogs } from '../../lib/catalogs';
import { diasHasta, formatComprobante, formatDate, formatMoney } from '../../lib/format';
import { descargarPdf } from '../../lib/pdf';
import { useToast } from '../../lib/toast';
import type { Invoice } from '../../lib/types';
import { Qr } from '../../components/Qr';
import { Alert, Badge, Button, Card } from '../../components/ui';
import {
  IconCheck,
  IconComprobantes,
  IconDescargar,
  IconFacturar,
} from '../../components/Icons';

/** Pantalla de éxito: el CAE es el protagonista. */
export function ResultadoEmision({
  invoice,
  onNueva,
  demoMode,
}: {
  invoice: Invoice;
  onNueva: () => void;
  demoMode: boolean;
}): JSX.Element {
  const { descComprobante } = useCatalogs();
  const toast = useToast();
  const [bajando, setBajando] = useState(false);

  const numero = invoice.numeroFormateado ?? formatComprobante(invoice.ptoVta, invoice.cbteNro);
  const dias = diasHasta(invoice.caeVto);

  async function bajar(): Promise<void> {
    setBajando(true);
    try {
      await descargarPdf(invoice.id, numero);
    } catch (e) {
      toast.error('No pudimos descargar el PDF', mensajeDeError(e));
    } finally {
      setBajando(false);
    }
  }

  const observaciones = Array.isArray(invoice.observaciones) ? invoice.observaciones : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-col items-center text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <IconCheck className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          ¡Comprobante emitido!
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          ARCA te otorgó el CAE. Ya podés enviárselo a tu cliente.
        </p>
      </div>

      {demoMode ? (
        <Alert tono="ambar" className="mb-4" titulo="Estás en modo demo">
          Este CAE es simulado: el comprobante no tiene validez fiscal. Sirve para probar el
          circuito completo sin certificados.
        </Alert>
      ) : null}

      <Card className="mb-4 border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              CAE
            </p>
            <p className="mt-1 break-all font-mono text-4xl font-black leading-none tracking-tight text-emerald-900 tabular sm:text-5xl dark:text-emerald-100">
              {invoice.cae ?? '—'}
            </p>
            <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
              Vence el <strong className="tabular">{formatDate(invoice.caeVto)}</strong>
              {dias !== null ? (
                <span className="opacity-80">
                  {' '}
                  ({dias >= 0 ? `en ${dias} día${dias === 1 ? '' : 's'}` : 'vencido'})
                </span>
              ) : null}
            </p>
          </div>
          <Qr url={invoice.qrUrl} tamano={128} />
        </div>
      </Card>

      <Card className="mb-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Comprobante
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-bold text-slate-900 tabular dark:text-white">
              {numero}
            </dd>
            <dd className="text-sm text-slate-500 dark:text-slate-400">
              {invoice.descripcionComprobante ?? descComprobante(invoice.cbteTipo)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Total
            </dt>
            <dd className="mt-0.5 text-xl font-bold text-slate-900 tabular dark:text-white">
              {formatMoney(invoice.impTotal)}
            </dd>
            <dd className="text-sm text-slate-500 dark:text-slate-400">
              Neto {formatMoney(invoice.impNeto)} · IVA {formatMoney(invoice.impIVA)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Receptor
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              {invoice.receptorRazonSocial ?? invoice.customer?.razonSocial ?? 'Consumidor Final'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Fecha
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800 tabular dark:text-slate-200">
              {formatDate(invoice.fechaCbte)}
            </dd>
          </div>
        </dl>

        {observaciones.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Observaciones de ARCA
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-amber-900 dark:text-amber-100">
              {observaciones.map((o, i) => (
                <li key={i}>
                  <Badge tono="ambar" className="mr-1.5">
                    {o.code ?? o.Code}
                  </Badge>
                  {o.msg ?? o.Msg}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          tamano="lg"
          variante="exito"
          cargando={bajando}
          iconoIzq={<IconDescargar className="h-4 w-4" />}
          onClick={() => void bajar()}
        >
          Descargar PDF
        </Button>
        <Button
          tamano="lg"
          iconoIzq={<IconFacturar className="h-4 w-4" />}
          onClick={onNueva}
        >
          Nueva factura
        </Button>
        <Link to={`/comprobantes/${invoice.id}`}>
          <Button
            tamano="lg"
            variante="secundario"
            iconoIzq={<IconComprobantes className="h-4 w-4" />}
          >
            Ver comprobante
          </Button>
        </Link>
      </div>
    </div>
  );
}
