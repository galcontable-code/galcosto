import { useCallback, useEffect, useRef, useState } from 'react';
import { api, comoLista, mensajeDeError } from '../../lib/api';
import { useCatalogs } from '../../lib/catalogs';
import {
  enmascararCuit,
  formatCuit,
  soloDigitos,
  validarCuit,
  validarDocumento,
} from '../../lib/format';
import { useCerrarAlClickAfuera, useDebounced } from '../../lib/hooks';
import { useToast } from '../../lib/toast';
import type { Customer } from '../../lib/types';
import { Alert, Badge, Button, Card, Field, Input, Select, cx } from '../../components/ui';
import { IconBuscar, IconCheck, IconClientes, IconRayo } from '../../components/Icons';
import type { WizardState } from './state';

interface Props {
  state: WizardState;
  companyId: string;
  set: (parcial: Partial<WizardState>) => void;
}

export function Paso1Cliente({ state, companyId, set }: Props): JSX.Element {
  const { tiposDocumento, condicionesIvaReceptor, descCondicionIva } = useCatalogs();
  const toast = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Customer[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [padronCargando, setPadronCargando] = useState(false);
  const [padronError, setPadronError] = useState<string | null>(null);
  const [clienteElegido, setClienteElegido] = useState<Customer | null>(null);

  const busquedaDebounced = useDebounced(busqueda, 250);
  const cerrarLista = useCallback(() => setListaAbierta(false), []);
  const refLista = useCerrarAlClickAfuera(listaAbierta, cerrarLista);
  const refBusqueda = useRef<HTMLInputElement>(null);
  const refCuit = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refBusqueda.current?.focus();
  }, []);

  // Typeahead de clientes existentes.
  useEffect(() => {
    const termino = busquedaDebounced.trim();
    if (termino.length < 2) {
      setResultados([]);
      return;
    }
    let vivo = true;
    setBuscando(true);
    api
      .customers({ search: termino, companyId })
      .then((res) => {
        if (!vivo) return;
        setResultados(comoLista(res).slice(0, 8));
        setResaltado(0);
      })
      .catch(() => {
        if (vivo) setResultados([]);
      })
      .finally(() => {
        if (vivo) setBuscando(false);
      });
    return () => {
      vivo = false;
    };
  }, [busquedaDebounced, companyId]);

  const consumidorFinal = state.docTipo === 99;
  const errorDoc = consumidorFinal ? null : validarDocumento(state.docTipo, state.docNro);
  const cuitValido =
    (state.docTipo === 80 || state.docTipo === 86) && validarCuit(state.docNro);

  function elegirCliente(c: Customer): void {
    setClienteElegido(c);
    setBusqueda('');
    setListaAbierta(false);
    setPadronError(null);
    set({
      customerId: c.id,
      docTipo: c.docTipo,
      docNro: c.docNro,
      receptorRazonSocial: c.razonSocial,
      receptorDomicilio: c.domicilio ?? '',
      condicionIvaReceptorId: c.condicionIvaReceptorId,
    });
  }

  function limpiarCliente(): void {
    setClienteElegido(null);
    set({
      customerId: null,
      docNro: '',
      receptorRazonSocial: '',
      receptorDomicilio: '',
      condicionIvaReceptorId: 5,
      docTipo: 80,
    });
    window.setTimeout(() => refBusqueda.current?.focus(), 30);
  }

  function ponerConsumidorFinal(): void {
    setClienteElegido(null);
    set({
      customerId: null,
      docTipo: 99,
      docNro: '',
      receptorRazonSocial: 'Consumidor Final',
      receptorDomicilio: '',
      condicionIvaReceptorId: 5,
    });
  }

  async function traerDelPadron(): Promise<void> {
    const cuit = soloDigitos(state.docNro);
    if (!validarCuit(cuit)) {
      setPadronError('Revisá el CUIT: el dígito verificador no da.');
      refCuit.current?.focus();
      return;
    }
    setPadronCargando(true);
    setPadronError(null);
    try {
      const datos = await api.padron(cuit, companyId);
      set({
        receptorRazonSocial: datos.razonSocial,
        receptorDomicilio:
          [datos.domicilio, datos.localidad, datos.provincia].filter(Boolean).join(', ') ||
          state.receptorDomicilio,
        condicionIvaReceptorId: datos.condicionIvaReceptorId,
        customerId: null,
      });
      setClienteElegido(null);
      toast.exito(
        'Datos traídos de ARCA',
        `${datos.razonSocial} · ${descCondicionIva(datos.condicionIvaReceptorId)}`,
      );
    } catch (e) {
      setPadronError(mensajeDeError(e));
    } finally {
      setPadronCargando(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Buscador */}
      <Card className="lg:col-span-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Buscar un cliente que ya tenés
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Escribí razón social, nombre o documento.
        </p>

        <div ref={refLista} className="relative mt-3">
          <div className="relative">
            <IconBuscar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              ref={refBusqueda}
              type="search"
              className="pl-9"
              placeholder="Buscar cliente…"
              value={busqueda}
              autoComplete="off"
              data-no-enter="true"
              onChange={(e) => {
                setBusqueda(e.target.value);
                setListaAbierta(true);
              }}
              onFocus={() => setListaAbierta(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setResaltado((r) => Math.min(r + 1, resultados.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setResaltado((r) => Math.max(r - 1, 0));
                } else if (e.key === 'Enter' && listaAbierta && resultados[resaltado]) {
                  e.preventDefault();
                  e.stopPropagation();
                  elegirCliente(resultados[resaltado]);
                }
              }}
              aria-label="Buscar cliente"
              aria-autocomplete="list"
              aria-expanded={listaAbierta}
            />
          </div>

          {listaAbierta && busqueda.trim().length >= 2 ? (
            <ul
              role="listbox"
              className="absolute z-30 mt-1 max-h-72 w-full animate-fade-in overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              {buscando ? (
                <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>
              ) : resultados.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  No encontramos clientes con ese dato. Cargalo a la derecha.
                </li>
              ) : (
                resultados.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === resaltado}
                      onMouseEnter={() => setResaltado(i)}
                      onClick={() => elegirCliente(c)}
                      className={cx(
                        'flex w-full flex-col items-start rounded-md px-2.5 py-2 text-left transition',
                        i === resaltado
                          ? 'bg-brand-50 dark:bg-brand-950'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                      )}
                    >
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {c.razonSocial}
                      </span>
                      <span className="text-xs text-slate-500 tabular dark:text-slate-400">
                        {c.docTipo === 99 ? 'Consumidor final' : formatCuit(c.docNro)} ·{' '}
                        {descCondicionIva(c.condicionIvaReceptorId)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Atajo</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            ¿Vendés a mostrador? Emitís directo a consumidor final, sin datos.
          </p>
          <Button
            variante={consumidorFinal ? 'primario' : 'secundario'}
            tamano="sm"
            className="mt-2.5"
            iconoIzq={
              consumidorFinal ? <IconCheck className="h-4 w-4" /> : <IconRayo className="h-4 w-4" />
            }
            onClick={ponerConsumidorFinal}
          >
            Consumidor final
          </Button>
        </div>

        {clienteElegido ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  <IconClientes className="h-3.5 w-3.5" /> Cliente seleccionado
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  {clienteElegido.razonSocial}
                </p>
              </div>
              <button type="button" onClick={limpiarCliente} className="text-xs font-medium underline">
                Cambiar
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Datos del receptor */}
      <Card className="lg:col-span-3">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Datos del receptor
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Con el CUIT alcanza: traemos el resto del padrón de ARCA.
            </p>
          </div>
          {state.customerId ? (
            <Badge tono="verde" punto>
              Cliente guardado
            </Badge>
          ) : consumidorFinal ? (
            <Badge tono="azul">Consumidor final</Badge>
          ) : (
            <Badge tono="contorno">Carga rápida</Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-12">
          <Field label="Tipo de documento" className="sm:col-span-4">
            {(id) => (
              <Select
                id={id}
                value={state.docTipo}
                onChange={(e) => {
                  const docTipo = Number(e.target.value);
                  if (docTipo === 99) ponerConsumidorFinal();
                  else set({ docTipo, customerId: null });
                }}
              >
                {tiposDocumento.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.desc}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label={state.docTipo === 80 || state.docTipo === 86 ? 'CUIT / CUIL' : 'Número'}
            className="sm:col-span-8"
            error={state.docNro.length > 0 ? errorDoc : null}
            ok={cuitValido ? 'CUIT válido (dígito verificador correcto).' : null}
            hint={consumidorFinal ? 'Consumidor final no necesita documento.' : undefined}
          >
            {(id) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  ref={refCuit}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={state.docTipo === 96 ? '30111222' : '20-11111111-2'}
                  disabled={consumidorFinal}
                  invalido={Boolean(state.docNro) && Boolean(errorDoc)}
                  value={
                    state.docTipo === 80 || state.docTipo === 86
                      ? enmascararCuit(state.docNro)
                      : state.docNro
                  }
                  onChange={(e) => set({ docNro: soloDigitos(e.target.value), customerId: null })}
                  className={cx(
                    'flex-1 tabular',
                    cuitValido && 'border-emerald-400 dark:border-emerald-700',
                  )}
                />
                <Button
                  variante="secundario"
                  onClick={() => void traerDelPadron()}
                  cargando={padronCargando}
                  disabled={consumidorFinal || !cuitValido}
                  className="shrink-0 whitespace-nowrap"
                  title="Consultar el padrón de ARCA con este CUIT"
                >
                  Traer datos de ARCA
                </Button>
              </div>
            )}
          </Field>

          {padronError ? (
            <div className="sm:col-span-12">
              <Alert tono="ambar" titulo="No pudimos traer el padrón">
                {padronError} Podés cargar los datos a mano igual.
              </Alert>
            </div>
          ) : null}

          <Field label="Razón social / Nombre" requerido={!consumidorFinal} className="sm:col-span-12">
            {(id) => (
              <Input
                id={id}
                placeholder="ACME S.A."
                value={state.receptorRazonSocial}
                onChange={(e) => set({ receptorRazonSocial: e.target.value })}
              />
            )}
          </Field>

          <Field label="Domicilio" className="sm:col-span-12">
            {(id) => (
              <Input
                id={id}
                placeholder="Av. Corrientes 1234, CABA"
                value={state.receptorDomicilio}
                onChange={(e) => set({ receptorDomicilio: e.target.value })}
              />
            )}
          </Field>

          <Field
            label="Condición frente al IVA"
            requerido
            className="sm:col-span-12"
            hint="Obligatoria desde la RG 5616. Define qué comprobante corresponde emitir."
          >
            {(id) => (
              <Select
                id={id}
                value={state.condicionIvaReceptorId}
                onChange={(e) =>
                  set({ condicionIvaReceptorId: Number(e.target.value), cbteTipo: null })
                }
              >
                {condicionesIvaReceptor.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.desc}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>
    </div>
  );
}
