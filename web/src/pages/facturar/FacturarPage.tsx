/**
 * Asistente de facturacion.
 *
 * Tres pasos (cliente, comprobante e items, confirmacion) y una pantalla de
 * resultado con el CAE. Los totales los calcula siempre el backend
 * (`/invoices/preview`) para que coincidan al centavo con lo que despues se
 * le manda a ARCA: si los calculara el navegador podrian diferir y ARCA
 * rechazaria el comprobante.
 *
 * El estado vive en sessionStorage, asi que recargar la pagina no pierde lo
 * que se venia cargando.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Invoice, PreviewResult } from '../../lib/types';
import { api, mensajeDeError, ApiError } from '../../lib/api';
import { useCompany } from '../../lib/company';
import { useToast } from '../../lib/toast';
import { useAtajo, useDebounced, useSessionState, useTitulo } from '../../lib/hooks';
import { Alert, Button, Card, EmptyState, Kbd, PageHeader, Spinner, cx } from '../../components/ui';
import { IconFacturar, IconFlechaDer, IconFlechaIzq, IconRayo } from '../../components/Icons';
import {
  CLAVE_SESION,
  armarInvoiceInput,
  estadoInicial,
  validarPaso1,
  validarPaso2,
  type WizardState,
} from './state';
import { Paso1Cliente } from './Paso1Cliente';
import { Paso2Comprobante } from './Paso2Comprobante';
import { Paso3Confirmar } from './Paso3Confirmar';
import { PanelTotales } from './PanelTotales';
import { ResultadoEmision } from './Resultado';

const PASOS = [
  { n: 1, titulo: 'Cliente', ayuda: 'A quien le facturas' },
  { n: 2, titulo: 'Comprobante', ayuda: 'Tipo, fecha e items' },
  { n: 3, titulo: 'Confirmar', ayuda: 'Revisar y emitir' },
] as const;

/**
 * Un comprobante puede fallar sin que ARCA se haya enterado: si no pasa
 * nuestras validaciones, la llamada nunca sale. Atribuirselo a ARCA manda al
 * usuario a buscar el problema donde no esta.
 */
function tituloDeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'ARCA_REJECTED') return 'ARCA no autorizo el comprobante';
    if (e.code === 'ARCA_UNAVAILABLE') return 'No pudimos conectarnos con ARCA';
    if (e.code === 'ARCA_CONFIG_ERROR') return 'Faltan credenciales de ARCA';
    if (e.code === 'VALIDATION_ERROR') return 'El comprobante tiene datos para corregir';
  }
  return 'No se pudo emitir el comprobante';
}

/** Etapas del pedido de CAE, para que la espera no sea una pantalla muda. */
const ETAPAS_EMISION = [
  'Validando el comprobante...',
  'Conectando con ARCA...',
  'Solicitando el CAE...',
];

export function FacturarPage(): JSX.Element {
  useTitulo('Facturar');
  const { company, companyId, cargando: cargandoEmpresas } = useCompany();
  const toast = useToast();
  const navigate = useNavigate();

  const [state, setState, limpiarSesion] = useSessionState<WizardState>(
    CLAVE_SESION,
    estadoInicial(companyId),
  );

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewCargando, setPreviewCargando] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [emitiendo, setEmitiendo] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [emitida, setEmitida] = useState<Invoice | null>(null);
  const [errorEmision, setErrorEmision] = useState<ApiError | Error | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const set = useCallback(
    (parcial: Partial<WizardState>) => setState((prev) => ({ ...prev, ...parcial })),
    [setState],
  );

  useEffect(() => {
    api
      .health()
      .then((h) => setDemoMode(Boolean(h.demoMode)))
      .catch(() => setDemoMode(false));
  }, []);

  // Si el usuario cambia de empresa emisora, el comprobante que venia
  // armando ya no aplica: numeracion, puntos de venta y tipo cambian.
  useEffect(() => {
    if (!companyId || state.companyId === companyId) return;
    setState(estadoInicial(companyId));
    setPreview(null);
    setEmitida(null);
    setErrorEmision(null);
  }, [companyId, state.companyId, setState]);

  /* ------------------------------------------------------------ preview */

  const input = useMemo(
    () => (companyId ? armarInvoiceInput(state, companyId) : null),
    [state, companyId],
  );
  const inputSerializado = useDebounced(input ? JSON.stringify(input) : '', 400);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!inputSerializado) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPreviewCargando(true);
    api
      .preview(JSON.parse(inputSerializado), ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setPreview(r);
        setPreviewError(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setPreview(null);
        setPreviewError(mensajeDeError(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setPreviewCargando(false);
      });

    return () => ctrl.abort();
  }, [inputSerializado]);

  /* ------------------------------------------------------- navegacion */

  const erroresPaso = useMemo(() => {
    if (state.paso === 1) return validarPaso1(state);
    if (state.paso === 2) return validarPaso2(state);
    return [];
  }, [state]);

  const puedeAvanzar = erroresPaso.length === 0 && (state.paso !== 2 || Boolean(preview));
  const [mostrarErrores, setMostrarErrores] = useState(false);

  const avanzar = useCallback(() => {
    if (erroresPaso.length > 0) {
      setMostrarErrores(true);
      return;
    }
    setMostrarErrores(false);
    set({ paso: Math.min(3, state.paso + 1) as 1 | 2 | 3 });
  }, [erroresPaso, set, state.paso]);

  const retroceder = useCallback(() => {
    setMostrarErrores(false);
    set({ paso: Math.max(1, state.paso - 1) as 1 | 2 | 3 });
  }, [set, state.paso]);

  /* ---------------------------------------------------------- emision */

  const emitir = useCallback(async () => {
    if (!companyId || !input || emitiendo) return;

    setEmitiendo(true);
    setErrorEmision(null);
    setEtapa(0);
    const tick = window.setInterval(
      () => setEtapa((e) => Math.min(ETAPAS_EMISION.length - 1, e + 1)),
      900,
    );

    try {
      const invoice = await api.emitir(input);
      setEmitida(invoice);
      limpiarSesion();
      toast.exito(
        `Comprobante ${invoice.numeroFormateado ?? ''} emitido`,
        invoice.cae ? `CAE ${invoice.cae}` : undefined,
      );
    } catch (e) {
      setErrorEmision(e instanceof Error ? e : new Error(String(e)));
      // Volvemos al paso 2 conservando todo lo cargado, que es donde se
      // corrige casi cualquier rechazo.
      set({ paso: 2 });
      toast.error(tituloDeError(e), mensajeDeError(e));
    } finally {
      window.clearInterval(tick);
      setEmitiendo(false);
    }
  }, [companyId, input, emitiendo, limpiarSesion, toast, set]);

  const nuevaFactura = useCallback(() => {
    setEmitida(null);
    setErrorEmision(null);
    setPreview(null);
    setState(estadoInicial(companyId));
  }, [companyId, setState]);

  useAtajo({ key: 'Enter' }, avanzar, !emitida && state.paso < 3 && !emitiendo);
  useAtajo({ key: 'Enter', ctrl: true }, emitir, !emitida && state.paso === 3 && !emitiendo);

  /* ------------------------------------------------------------ render */

  if (cargandoEmpresas) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!company || !companyId) {
    return (
      <EmptyState
        titulo="Todavia no hay una empresa emisora"
        descripcion="Para poder facturar necesitas dar de alta al menos una empresa con sus datos fiscales."
        icono={<IconFacturar className="h-6 w-6" />}
        accion={<Button onClick={() => navigate('/empresas')}>Ir a Empresas</Button>}
      />
    );
  }

  if (emitida) {
    return (
      <ResultadoEmision invoice={emitida} onNueva={nuevaFactura} demoMode={demoMode} />
    );
  }

  const detalles = errorEmision instanceof ApiError ? errorEmision.details : undefined;

  return (
    <div>
      <PageHeader
        titulo="Facturar"
        descripcion={`Emitiendo por ${company.razonSocial}`}
        acciones={
          <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex dark:text-slate-400">
            <Kbd>Enter</Kbd> avanzar · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> emitir
          </span>
        }
      />

      <Pasos actual={state.paso} onIr={(n) => n < state.paso && set({ paso: n })} />

      {errorEmision ? (
        <Alert tono="rojo" titulo={tituloDeError(errorEmision)} className="mb-4">
          <p>{mensajeDeError(errorEmision)}</p>
          {detalles && detalles.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {detalles.map((d, i) => (
                <li key={i}>
                  {d.code ? <span className="tabular font-semibold">[{d.code}] </span> : null}
                  {d.msg}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2">
            Corregí lo que haga falta y volvé a emitir: no se consumio numeracion.
          </p>
        </Alert>
      ) : null}

      {mostrarErrores && erroresPaso.length > 0 ? (
        <Alert tono="ambar" titulo="Falta completar algunos datos" className="mb-4">
          <ul className="list-disc space-y-1 pl-5">
            {erroresPaso.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {state.paso === 1 ? (
            <Paso1Cliente state={state} companyId={companyId} set={set} />
          ) : null}
          {state.paso === 2 ? (
            <Paso2Comprobante state={state} company={company} preview={preview} set={set} />
          ) : null}
          {state.paso === 3 ? (
            <Paso3Confirmar state={state} company={company} preview={preview} />
          ) : null}

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              variante="secundario"
              onClick={retroceder}
              disabled={state.paso === 1 || emitiendo}
              iconoIzq={<IconFlechaIzq className="h-4 w-4" />}
            >
              Volver
            </Button>

            {state.paso < 3 ? (
              <Button
                onClick={avanzar}
                disabled={emitiendo}
                iconoDer={<IconFlechaDer className="h-4 w-4" />}
                title={puedeAvanzar ? undefined : 'Completá los datos que faltan'}
              >
                Continuar
              </Button>
            ) : (
              <Button
                onClick={emitir}
                cargando={emitiendo}
                disabled={emitiendo || !input}
                tamano="lg"
                iconoIzq={<IconRayo className="h-4 w-4" />}
              >
                {emitiendo ? ETAPAS_EMISION[etapa] : 'Emitir y obtener CAE'}
              </Button>
            )}
          </div>

          <p aria-live="polite" className="sr-only">
            {emitiendo ? ETAPAS_EMISION[etapa] : ''}
          </p>
        </div>

        <PanelTotales
          preview={preview}
          cargando={previewCargando}
          error={previewError}
          monId={state.monId}
          ptoVta={state.ptoVta}
        />
      </div>
    </div>
  );
}

/** Barra de progreso del asistente. Se puede volver a un paso ya hecho. */
function Pasos({
  actual,
  onIr,
}: {
  actual: number;
  onIr: (n: 1 | 2 | 3) => void;
}): JSX.Element {
  return (
    <Card className="mb-5" padding={false}>
      <ol className="grid grid-cols-3">
        {PASOS.map((p, i) => {
          const hecho = actual > p.n;
          const activo = actual === p.n;
          return (
            <li key={p.n} className={cx(i > 0 && 'border-l border-slate-200 dark:border-slate-800')}>
              <button
                type="button"
                onClick={() => onIr(p.n)}
                disabled={!hecho}
                className={cx(
                  'flex w-full items-center gap-2.5 px-4 py-3 text-left transition',
                  hecho && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                  !hecho && !activo && 'cursor-default',
                )}
                aria-current={activo ? 'step' : undefined}
              >
                <span
                  className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    activo && 'bg-blue-600 text-white',
                    hecho && 'bg-emerald-500 text-white',
                    !activo && !hecho && 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                  )}
                >
                  {hecho ? '✓' : p.n}
                </span>
                <span className="min-w-0">
                  <span
                    className={cx(
                      'block truncate text-sm font-semibold',
                      activo ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400',
                    )}
                  >
                    {p.titulo}
                  </span>
                  <span className="hidden truncate text-xs text-slate-400 sm:block">{p.ayuda}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
