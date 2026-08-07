import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  discriminaIva,
  letraDeComprobante,
  porQueEseComprobante,
  requierePeriodoServicio,
  useCatalogs,
} from '../../lib/catalogs';
import { hoyISO, parseImporte, rangoDelMes, sumarDias } from '../../lib/format';
import type { Company, PreviewResult, PuntoVenta } from '../../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  cx,
} from '../../components/ui';
import { IconInfo, IconMas, IconBorrar } from '../../components/Icons';
import { ItemsGrid } from './ItemsGrid';
import { nuevaKey, type TributoWizard, type WizardState } from './state';

interface Props {
  state: WizardState;
  company: Company;
  preview: PreviewResult | null;
  set: (parcial: Partial<WizardState>) => void;
}

export function Paso2Comprobante({ state, company, preview, set }: Props): JSX.Element {
  const {
    tiposComprobante,
    conceptos,
    monedas,
    tiposTributo,
    descComprobante,
    descCondicionIva,
  } = useCatalogs();

  const [puntosVenta, setPuntosVenta] = useState<PuntoVenta[] | null>(null);
  const [mostrarTributos, setMostrarTributos] = useState(state.tributos.length > 0);
  const [tipoManual, setTipoManual] = useState(state.cbteTipo !== null);

  // Puntos de venta habilitados en ARCA. Si falla, se carga a mano.
  useEffect(() => {
    let vivo = true;
    api
      .puntosVenta(company.id)
      .then((pv) => {
        if (vivo) setPuntosVenta(pv.filter((p) => !p.Bloqueado && !p.FchBaja));
      })
      .catch(() => {
        if (vivo) setPuntosVenta([]);
      });
    return () => {
      vivo = false;
    };
  }, [company.id]);

  const sugerido = preview?.cbteTipoSugerido ?? null;
  const cbteTipoEfectivo = state.cbteTipo ?? sugerido ?? 11;
  const letra = letraDeComprobante(cbteTipoEfectivo);
  const discrimina = discriminaIva(cbteTipoEfectivo);
  const conServicios = requierePeriodoServicio(state.concepto);

  // Al pasar a un concepto con servicios precargamos el mes en curso.
  useEffect(() => {
    if (!conServicios) return;
    if (state.fchServDesde && state.fchServHasta) return;
    const { desde, hasta } = rangoDelMes();
    set({
      fchServDesde: state.fchServDesde || desde,
      fchServHasta: state.fchServHasta || hasta,
      fchVtoPago: state.fchVtoPago || sumarDias(state.fechaCbte || hoyISO(), 10),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conServicios]);

  function actualizarTributo(key: string, parcial: Partial<TributoWizard>): void {
    set({ tributos: state.tributos.map((t) => (t.key === key ? { ...t, ...parcial } : t)) });
  }

  function agregarTributo(): void {
    set({
      tributos: [
        ...state.tributos,
        {
          key: nuevaKey(),
          tributoId: 2,
          descripcion: 'IIBB',
          baseImp: preview?.totals.impNeto ?? 0,
          alicuota: 3,
        },
      ],
    });
    setMostrarTributos(true);
  }

  return (
    <div className="space-y-5">
      {/* Tipo de comprobante */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Tipo de comprobante
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span
                className={cx(
                  'flex h-11 w-11 items-center justify-center rounded-lg text-xl font-black',
                  letra === 'A'
                    ? 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                    : letra === 'B'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : letra === 'C'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                )}
                aria-hidden="true"
              >
                {letra}
              </span>
              <div>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {descComprobante(cbteTipoEfectivo)}
                </p>
                {!tipoManual && sugerido ? (
                  <Badge tono="azul" className="mt-1">
                    Sugerido automáticamente
                  </Badge>
                ) : (
                  <Badge tono="ambar" className="mt-1">
                    Elegido a mano
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm">
            {tipoManual ? (
              <Field label="Elegí el tipo de comprobante">
                {(id) => (
                  <div className="flex gap-2">
                    <Select
                      id={id}
                      value={cbteTipoEfectivo}
                      onChange={(e) => set({ cbteTipo: Number(e.target.value) })}
                      className="flex-1"
                    >
                      {tiposComprobante.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.desc}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variante="secundario"
                      onClick={() => {
                        setTipoManual(false);
                        set({ cbteTipo: null });
                      }}
                    >
                      Volver al sugerido
                    </Button>
                  </div>
                )}
              </Field>
            ) : (
              <Button variante="secundario" tamano="sm" onClick={() => setTipoManual(true)}>
                Cambiar el tipo de comprobante
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p>
            <span className="font-medium">Por qué este comprobante: </span>
            {porQueEseComprobante(
              company.condicionIva,
              descCondicionIva(state.condicionIvaReceptorId),
            )}
            {!discrimina
              ? ' En clase C el IVA no se liquida: el precio que cargues es el total.'
              : ''}
          </p>
        </div>
      </Card>

      {/* Cabecera del comprobante */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Datos del comprobante
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Punto de venta" requerido>
            {(id) =>
              puntosVenta && puntosVenta.length > 0 ? (
                <Select
                  id={id}
                  value={state.ptoVta}
                  onChange={(e) => set({ ptoVta: Number(e.target.value) })}
                >
                  {puntosVenta.map((pv) => (
                    <option key={pv.Nro} value={pv.Nro}>
                      {String(pv.Nro).padStart(4, '0')} · {pv.EmisionTipo}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  value={state.ptoVta}
                  onChange={(e) => set({ ptoVta: Number(e.target.value) })}
                />
              )
            }
          </Field>

          <Field label="Concepto" requerido>
            {(id) => (
              <Select
                id={id}
                value={state.concepto}
                onChange={(e) => set({ concepto: Number(e.target.value) })}
              >
                {conceptos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.desc}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Fecha del comprobante" requerido>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={state.fechaCbte}
                onChange={(e) => set({ fechaCbte: e.target.value })}
              />
            )}
          </Field>

          <Field label="Moneda">
            {(id) => (
              <Select
                id={id}
                value={state.monId}
                onChange={(e) =>
                  set({
                    monId: e.target.value,
                    monCotiz: e.target.value === 'PES' ? 1 : state.monCotiz,
                  })
                }
              >
                {monedas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.desc}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {state.monId !== 'PES' ? (
            <Field
              label="Cotización"
              requerido
              hint="Cotización oficial del día del comprobante."
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  alineado="der"
                  value={state.monCotiz}
                  onChange={(e) => set({ monCotiz: parseImporte(e.target.value) })}
                />
              )}
            </Field>
          ) : null}

          {conServicios ? (
            <>
              <Field label="Servicio desde" requerido>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={state.fchServDesde}
                    onChange={(e) => set({ fchServDesde: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Servicio hasta" requerido>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={state.fchServHasta}
                    onChange={(e) => set({ fchServHasta: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Vencimiento de pago" requerido>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={state.fchVtoPago}
                    onChange={(e) => set({ fchVtoPago: e.target.value })}
                  />
                )}
              </Field>
            </>
          ) : null}
        </div>

        {conServicios ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            El concepto incluye servicios: ARCA exige informar el período facturado y el
            vencimiento del pago.
          </p>
        ) : null}
      </Card>

      {/* Ítems */}
      <Card>
        <ItemsGrid
          items={state.items}
          companyId={company.id}
          monId={state.monId}
          preciosConIva={state.preciosConIva}
          discrimina={discrimina}
          onChange={(items) => set({ items })}
          onTogglePreciosConIva={(v) => set({ preciosConIva: v })}
        />
      </Card>

      {/* Otros tributos y observaciones */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Otros tributos y observaciones
          </h3>
          {!mostrarTributos ? (
            <Button
              variante="secundario"
              tamano="sm"
              iconoIzq={<IconMas className="h-4 w-4" />}
              onClick={agregarTributo}
            >
              Agregar tributo
            </Button>
          ) : null}
        </div>

        {mostrarTributos ? (
          <div className="mb-4 space-y-2.5">
            {state.tributos.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No hay tributos cargados.
              </p>
            ) : null}
            {state.tributos.map((t, idx) => (
              <div
                key={t.key}
                className="grid grid-cols-2 gap-2 lg:grid-cols-[9rem_minmax(0,1fr)_8rem_6rem_2rem] lg:items-end"
              >
                <Field label={idx === 0 ? 'Tipo' : undefined}>
                  {(id) => (
                    <Select
                      id={id}
                      value={t.tributoId}
                      data-no-enter="true"
                      onChange={(e) =>
                        actualizarTributo(t.key, { tributoId: Number(e.target.value) })
                      }
                    >
                      {tiposTributo.map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {tt.desc}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={idx === 0 ? 'Descripción' : undefined}>
                  {(id) => (
                    <Input
                      id={id}
                      value={t.descripcion}
                      data-no-enter="true"
                      placeholder="IIBB CABA"
                      onChange={(e) => actualizarTributo(t.key, { descripcion: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={idx === 0 ? 'Base imponible' : undefined}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      alineado="der"
                      data-no-enter="true"
                      value={t.baseImp === 0 ? '' : String(t.baseImp)}
                      onChange={(e) =>
                        actualizarTributo(t.key, { baseImp: parseImporte(e.target.value) })
                      }
                    />
                  )}
                </Field>
                <Field label={idx === 0 ? 'Alícuota %' : undefined}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      alineado="der"
                      data-no-enter="true"
                      value={t.alicuota === 0 ? '' : String(t.alicuota)}
                      onChange={(e) =>
                        actualizarTributo(t.key, { alicuota: parseImporte(e.target.value) })
                      }
                    />
                  )}
                </Field>
                <button
                  type="button"
                  aria-label="Quitar tributo"
                  onClick={() =>
                    set({ tributos: state.tributos.filter((x) => x.key !== t.key) })
                  }
                  className="mb-1 justify-self-end rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  <IconBorrar className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              variante="secundario"
              tamano="sm"
              iconoIzq={<IconMas className="h-4 w-4" />}
              onClick={agregarTributo}
            >
              Agregar otro
            </Button>
          </div>
        ) : null}

        <Field label="Observaciones (se imprimen al pie)">
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              placeholder="Forma de pago, orden de compra, remito asociado…"
              value={state.observaciones}
              onChange={(e) => set({ observaciones: e.target.value })}
            />
          )}
        </Field>
      </Card>

      {!discrimina && state.preciosConIva ? (
        <Alert tono="ambar" titulo="El comprobante C no discrimina IVA">
          Desactivamos el cálculo con IVA incluido: el precio que cargás es directamente el total.
        </Alert>
      ) : null}
    </div>
  );
}
