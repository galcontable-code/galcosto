import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { api, comoLista } from '../../lib/api';
import { useCatalogs } from '../../lib/catalogs';
import { useCerrarAlClickAfuera, useDebounced } from '../../lib/hooks';
import { formatMoney, parseImporte, simboloMoneda } from '../../lib/format';
import type { Product } from '../../lib/types';
import { Button, Input, Select, Toggle, cx } from '../../components/ui';
import { IconBorrar, IconMas } from '../../components/Icons';
import { itemVacio, type ItemWizard } from './state';

interface Props {
  items: ItemWizard[];
  companyId: string;
  monId: string;
  preciosConIva: boolean;
  discrimina: boolean;
  onChange: (items: ItemWizard[]) => void;
  onTogglePreciosConIva: (v: boolean) => void;
}

/** Subtotal de una fila, calculado en el front sólo para feedback inmediato. */
function subtotalFila(item: ItemWizard, alicuota: number, conIva: boolean, discrimina: boolean): number {
  const bruto = item.cantidad * item.precioUnitario * (1 - (item.bonificacion || 0) / 100);
  if (!discrimina) return bruto;
  if (conIva) return bruto;
  return bruto * (1 + alicuota / 100);
}

export function ItemsGrid({
  items,
  companyId,
  monId,
  preciosConIva,
  discrimina,
  onChange,
  onTogglePreciosConIva,
}: Props): JSX.Element {
  const { alicuotasIva, alicuota } = useCatalogs();
  const simbolo = simboloMoneda(monId);
  const refUltimaDescripcion = useRef<HTMLInputElement>(null);
  const [enfocarUltima, setEnfocarUltima] = useState(false);

  useEffect(() => {
    if (enfocarUltima) {
      refUltimaDescripcion.current?.focus();
      setEnfocarUltima(false);
    }
  }, [enfocarUltima, items.length]);

  function actualizar(key: string, parcial: Partial<ItemWizard>): void {
    onChange(items.map((i) => (i.key === key ? { ...i, ...parcial } : i)));
  }

  function agregar(): void {
    const ultimo = items[items.length - 1];
    onChange([...items, itemVacio(ultimo?.ivaId ?? 5)]);
    setEnfocarUltima(true);
  }

  function quitar(key: string): void {
    const restantes = items.filter((i) => i.key !== key);
    onChange(restantes.length > 0 ? restantes : [itemVacio()]);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ítems</h3>
        <Toggle
          checked={preciosConIva}
          onChange={onTogglePreciosConIva}
          label="Los precios incluyen IVA"
          disabled={!discrimina}
          descripcion={
            discrimina
              ? 'Si está activo, del precio se despeja el neto.'
              : 'El comprobante C no discrimina IVA.'
          }
        />
      </div>

      {/* Encabezados (sólo escritorio) */}
      <div className="hidden gap-2 border-b border-slate-200 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(0,1fr)_5rem_7.5rem_5rem_6.5rem_7.5rem_2rem] dark:border-slate-800 dark:text-slate-400">
        <span>Descripción</span>
        <span className="text-right">Cant.</span>
        <span className="text-right">P. unitario</span>
        <span className="text-right">Bonif. %</span>
        <span>IVA</span>
        <span className="text-right">Subtotal</span>
        <span />
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item, idx) => {
          const alic = alicuota(item.ivaId);
          const subtotal = subtotalFila(item, alic, preciosConIva, discrimina);
          const esUltima = idx === items.length - 1;
          return (
            <li
              key={item.key}
              className="grid grid-cols-2 gap-2 py-2.5 lg:grid-cols-[minmax(0,1fr)_5rem_7.5rem_5rem_6.5rem_7.5rem_2rem] lg:items-center lg:gap-2"
            >
              <div className="col-span-2 lg:col-span-1">
                <label className="lbl lg:sr-only">Descripción</label>
                <AutocompleteProducto
                  ref={esUltima ? refUltimaDescripcion : undefined}
                  companyId={companyId}
                  valor={item.descripcion}
                  onTexto={(descripcion) => actualizar(item.key, { descripcion, productId: null })}
                  onProducto={(p) =>
                    actualizar(item.key, {
                      productId: p.id,
                      descripcion: p.descripcion,
                      precioUnitario: p.precioUnitario,
                      ivaId: p.ivaId,
                      unidad: p.unidad || 'unidad',
                    })
                  }
                  onEnterFinal={esUltima ? agregar : undefined}
                />
              </div>

              <div>
                <label className="lbl lg:sr-only">Cantidad</label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  alineado="der"
                  data-no-enter="true"
                  value={item.cantidad}
                  onChange={(e) => actualizar(item.key, { cantidad: Number(e.target.value) })}
                  aria-label={`Cantidad del ítem ${idx + 1}`}
                />
              </div>

              <div>
                <label className="lbl lg:sr-only">Precio unitario</label>
                <Input
                  inputMode="decimal"
                  alineado="der"
                  data-no-enter="true"
                  value={item.precioUnitario === 0 ? '' : String(item.precioUnitario)}
                  placeholder="0,00"
                  onChange={(e) =>
                    actualizar(item.key, { precioUnitario: parseImporte(e.target.value) })
                  }
                  aria-label={`Precio unitario del ítem ${idx + 1}`}
                />
              </div>

              <div>
                <label className="lbl lg:sr-only">Bonificación %</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  alineado="der"
                  data-no-enter="true"
                  value={item.bonificacion === 0 ? '' : item.bonificacion}
                  placeholder="0"
                  onChange={(e) =>
                    actualizar(item.key, {
                      bonificacion: Math.min(100, Math.max(0, Number(e.target.value))),
                    })
                  }
                  aria-label={`Bonificación del ítem ${idx + 1}`}
                />
              </div>

              <div>
                <label className="lbl lg:sr-only">Alícuota de IVA</label>
                <Select
                  value={item.ivaId}
                  disabled={!discrimina}
                  data-no-enter="true"
                  onChange={(e) => actualizar(item.key, { ivaId: Number(e.target.value) })}
                  aria-label={`Alícuota de IVA del ítem ${idx + 1}`}
                >
                  {alicuotasIva.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.desc}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center justify-end lg:block">
                <span className="lbl mb-0 mr-2 lg:sr-only">Subtotal</span>
                <span
                  className={cx(
                    'block text-right text-sm font-semibold tabular',
                    subtotal > 0
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-slate-400 dark:text-slate-600',
                  )}
                >
                  {formatMoney(subtotal, simbolo)}
                </span>
              </div>

              <div className="col-span-2 flex justify-end lg:col-span-1">
                <button
                  type="button"
                  onClick={() => quitar(item.key)}
                  aria-label={`Quitar el ítem ${idx + 1}`}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  <IconBorrar className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        variante="secundario"
        tamano="sm"
        className="mt-3"
        iconoIzq={<IconMas className="h-4 w-4" />}
        onClick={agregar}
      >
        Agregar ítem
      </Button>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Tip: si escribís en la descripción te sugerimos productos ya cargados, con su precio y su
        alícuota.
      </p>
    </div>
  );
}

/* --------------------------------------------- autocompletado de productos */

interface AutoProps {
  companyId: string;
  valor: string;
  onTexto: (v: string) => void;
  onProducto: (p: Product) => void;
  onEnterFinal?: () => void;
}

const AutocompleteProducto = forwardRef<HTMLInputElement, AutoProps>(
  function AutocompleteProducto(
    { companyId, valor, onTexto, onProducto, onEnterFinal },
    ref,
  ): JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Product[]>([]);
  const [resaltado, setResaltado] = useState(0);
  const termino = useDebounced(valor, 250);
  const cerrar = useCallback(() => setAbierto(false), []);
  const contenedor = useCerrarAlClickAfuera(abierto, cerrar);

  useEffect(() => {
    const t = termino.trim();
    if (!abierto || t.length < 2) {
      setResultados([]);
      return;
    }
    let vivo = true;
    api
      .products({ companyId, search: t })
      .then((res) => {
        if (vivo) {
          setResultados(comoLista(res).slice(0, 6));
          setResaltado(0);
        }
      })
      .catch(() => {
        if (vivo) setResultados([]);
      });
    return () => {
      vivo = false;
    };
  }, [termino, companyId, abierto]);

  return (
    <div ref={contenedor} className="relative">
      <Input
        ref={ref}
        value={valor}
        autoComplete="off"
        placeholder="Descripción del producto o servicio"
        onChange={(e) => {
          onTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && resultados.length > 0) {
            e.preventDefault();
            setResaltado((r) => Math.min(r + 1, resultados.length - 1));
          } else if (e.key === 'ArrowUp' && resultados.length > 0) {
            e.preventDefault();
            setResaltado((r) => Math.max(r - 1, 0));
          } else if (e.key === 'Enter') {
            if (abierto && resultados[resaltado]) {
              e.preventDefault();
              e.stopPropagation();
              onProducto(resultados[resaltado]);
              setAbierto(false);
            } else if (onEnterFinal && valor.trim()) {
              e.preventDefault();
              e.stopPropagation();
              onEnterFinal();
            }
          } else if (e.key === 'Escape') {
            setAbierto(false);
          }
        }}
        aria-autocomplete="list"
        aria-expanded={abierto && resultados.length > 0}
      />
      {abierto && resultados.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 w-full min-w-[18rem] animate-fade-in overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {resultados.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === resaltado}
                onMouseEnter={() => setResaltado(i)}
                onClick={() => {
                  onProducto(p);
                  setAbierto(false);
                }}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition',
                  i === resaltado
                    ? 'bg-brand-50 dark:bg-brand-950'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
                  {p.descripcion}
                  {p.codigo ? (
                    <span className="ml-1.5 text-xs text-slate-400">{p.codigo}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-semibold text-slate-600 tabular dark:text-slate-300">
                  {formatMoney(p.precioUnitario)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
  },
);
