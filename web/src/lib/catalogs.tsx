import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { AlicuotaIva, CatalogEntry, Catalogs } from './types';

/**
 * Catálogos de ARCA. Se piden una sola vez (`GET /api/catalogs`, público) y
 * quedan en memoria. Hay un fallback local idéntico al del backend para que la
 * UI no quede vacía si la red falla.
 */

const FALLBACK: Catalogs = {
  tiposComprobante: [
    { id: 1, desc: 'Factura A' },
    { id: 2, desc: 'Nota de Débito A' },
    { id: 3, desc: 'Nota de Crédito A' },
    { id: 6, desc: 'Factura B' },
    { id: 7, desc: 'Nota de Débito B' },
    { id: 8, desc: 'Nota de Crédito B' },
    { id: 11, desc: 'Factura C' },
    { id: 12, desc: 'Nota de Débito C' },
    { id: 13, desc: 'Nota de Crédito C' },
    { id: 51, desc: 'Factura M' },
    { id: 52, desc: 'Nota de Débito M' },
    { id: 53, desc: 'Nota de Crédito M' },
  ],
  tiposDocumento: [
    { id: 80, desc: 'CUIT' },
    { id: 86, desc: 'CUIL' },
    { id: 96, desc: 'DNI' },
    { id: 99, desc: 'Consumidor Final' },
    { id: 87, desc: 'CDI' },
    { id: 94, desc: 'Pasaporte' },
  ],
  alicuotasIva: [
    { id: 3, desc: '0%', rate: 0 },
    { id: 9, desc: '2,5%', rate: 2.5 },
    { id: 8, desc: '5%', rate: 5 },
    { id: 4, desc: '10,5%', rate: 10.5 },
    { id: 5, desc: '21%', rate: 21 },
    { id: 6, desc: '27%', rate: 27 },
  ],
  condicionesIvaReceptor: [
    { id: 1, desc: 'IVA Responsable Inscripto' },
    { id: 4, desc: 'IVA Sujeto Exento' },
    { id: 5, desc: 'Consumidor Final' },
    { id: 6, desc: 'Responsable Monotributo' },
    { id: 7, desc: 'Sujeto No Categorizado' },
    { id: 8, desc: 'Proveedor del Exterior' },
    { id: 9, desc: 'Cliente del Exterior' },
    { id: 10, desc: 'IVA Liberado - Ley 19.640' },
    { id: 13, desc: 'Monotributista Social' },
    { id: 15, desc: 'IVA No Alcanzado' },
    { id: 16, desc: 'Monotributo Trabajador Independiente Promovido' },
  ],
  conceptos: [
    { id: 1, desc: 'Productos' },
    { id: 2, desc: 'Servicios' },
    { id: 3, desc: 'Productos y Servicios' },
  ],
  monedas: [
    { id: 'PES', desc: 'Pesos Argentinos' },
    { id: 'DOL', desc: 'Dólar Estadounidense' },
    { id: '060', desc: 'Euro' },
    { id: '012', desc: 'Real' },
  ],
  tiposTributo: [
    { id: 1, desc: 'Impuestos nacionales' },
    { id: 2, desc: 'Impuestos provinciales' },
    { id: 3, desc: 'Impuestos municipales' },
    { id: 4, desc: 'Impuestos internos' },
    { id: 99, desc: 'Otros' },
  ],
  unidades: [
    { id: 'unidad', desc: 'unidad' },
    { id: 'hora', desc: 'hora' },
    { id: 'kg', desc: 'kg' },
    { id: 'litro', desc: 'litro' },
    { id: 'metro', desc: 'metro' },
    { id: 'servicio', desc: 'servicio' },
  ],
};

interface CatalogsContextValue extends Catalogs {
  cargando: boolean;
  /** Descripción de un tipo de comprobante. */
  descComprobante: (id: number) => string;
  descTipoDoc: (id: number) => string;
  descCondicionIva: (id: number) => string;
  descConcepto: (id: number) => string;
  alicuota: (ivaId: number) => number;
  descAlicuota: (ivaId: number) => string;
}

const CatalogsContext = createContext<CatalogsContextValue | null>(null);

function completar(parcial: Partial<Catalogs> | null): Catalogs {
  if (!parcial) return FALLBACK;
  const tomar = <T,>(v: T[] | undefined, def: T[]): T[] =>
    Array.isArray(v) && v.length > 0 ? v : def;
  return {
    tiposComprobante: tomar<CatalogEntry<number>>(
      parcial.tiposComprobante,
      FALLBACK.tiposComprobante,
    ),
    tiposDocumento: tomar<CatalogEntry<number>>(parcial.tiposDocumento, FALLBACK.tiposDocumento),
    alicuotasIva: tomar<AlicuotaIva>(parcial.alicuotasIva, FALLBACK.alicuotasIva),
    condicionesIvaReceptor: tomar<CatalogEntry<number>>(
      parcial.condicionesIvaReceptor,
      FALLBACK.condicionesIvaReceptor,
    ),
    conceptos: tomar<CatalogEntry<number>>(parcial.conceptos, FALLBACK.conceptos),
    monedas: tomar<CatalogEntry<string>>(parcial.monedas, FALLBACK.monedas),
    tiposTributo: tomar<CatalogEntry<number>>(parcial.tiposTributo, FALLBACK.tiposTributo),
    unidades: tomar<CatalogEntry<string | number>>(parcial.unidades, FALLBACK.unidades),
  };
}

export function CatalogsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [catalogs, setCatalogs] = useState<Catalogs>(FALLBACK);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    api
      .catalogs()
      .then((c) => {
        if (vivo) setCatalogs(completar(c));
      })
      .catch(() => {
        /* nos quedamos con el fallback local */
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const value = useMemo<CatalogsContextValue>(() => {
    const buscar = (lista: CatalogEntry<number>[], id: number): string =>
      lista.find((e) => e.id === id)?.desc ?? `#${id}`;
    return {
      ...catalogs,
      cargando,
      descComprobante: (id) => buscar(catalogs.tiposComprobante, id),
      descTipoDoc: (id) => buscar(catalogs.tiposDocumento, id),
      descCondicionIva: (id) => buscar(catalogs.condicionesIvaReceptor, id),
      descConcepto: (id) => buscar(catalogs.conceptos, id),
      alicuota: (ivaId) => catalogs.alicuotasIva.find((a) => a.id === ivaId)?.rate ?? 0,
      descAlicuota: (ivaId) =>
        catalogs.alicuotasIva.find((a) => a.id === ivaId)?.desc ?? `#${ivaId}`,
    };
  }, [catalogs, cargando]);

  return <CatalogsContext.Provider value={value}>{children}</CatalogsContext.Provider>;
}

export function useCatalogs(): CatalogsContextValue {
  const ctx = useContext(CatalogsContext);
  if (!ctx) throw new Error('useCatalogs tiene que usarse dentro de <CatalogsProvider>');
  return ctx;
}

/* --------------------------- helpers de negocio derivados del catálogo --- */

export function letraDeComprobante(cbteTipo: number): 'A' | 'B' | 'C' | 'M' | '-' {
  if ([1, 2, 3, 201, 202, 203].includes(cbteTipo)) return 'A';
  if ([6, 7, 8, 206, 207, 208].includes(cbteTipo)) return 'B';
  if ([11, 12, 13, 211, 212, 213].includes(cbteTipo)) return 'C';
  if ([51, 52, 53].includes(cbteTipo)) return 'M';
  return '-';
}

/** Los comprobantes C no liquidan IVA: el precio es el total. */
export function discriminaIva(cbteTipo: number): boolean {
  return letraDeComprobante(cbteTipo) !== 'C';
}

export function esNotaDeCredito(cbteTipo: number): boolean {
  return [3, 8, 13, 53, 203, 208, 213].includes(cbteTipo);
}

export function requierePeriodoServicio(concepto: number): boolean {
  return concepto === 2 || concepto === 3;
}

/** Mismo criterio que `tipoComprobanteSugerido` del backend. */
export function tipoComprobanteSugerido(
  condicionIvaEmisor: string,
  condicionIvaReceptorId: number,
): number {
  if (condicionIvaEmisor === 'MONOTRIBUTO' || condicionIvaEmisor === 'EXENTO') return 11;
  if (condicionIvaReceptorId === 1 || condicionIvaReceptorId === 6) return 1;
  return 6;
}

/** Explicación en texto de por qué se sugiere ese comprobante. */
export function porQueEseComprobante(
  condicionIvaEmisor: string,
  condicionIvaReceptorDesc: string,
): string {
  if (condicionIvaEmisor === 'MONOTRIBUTO') {
    return 'El emisor es monotributista, así que siempre corresponde comprobante clase C (no discrimina IVA).';
  }
  if (condicionIvaEmisor === 'EXENTO') {
    return 'El emisor es sujeto exento, así que siempre corresponde comprobante clase C (no discrimina IVA).';
  }
  return `El emisor es responsable inscripto y el receptor es "${condicionIvaReceptorDesc}": por eso corresponde esa clase de comprobante.`;
}
