import { hoyISO, soloDigitos } from '../../lib/format';
import type { InvoiceInput, InvoiceItemInput, TributoInput } from '../../lib/types';

/**
 * Estado del asistente de facturación.
 *
 * Vive en sessionStorage: si el contador recarga la página en medio de la
 * carga, no pierde nada. Se limpia recién cuando el comprobante se emite.
 */

export const CLAVE_SESION = 'galcosto.wizard';

export interface ItemWizard {
  /** Id local de la fila (React key). No viaja a la API. */
  key: string;
  productId: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  bonificacion: number;
  ivaId: number;
}

export interface TributoWizard {
  key: string;
  tributoId: number;
  descripcion: string;
  baseImp: number;
  alicuota: number;
}

export interface WizardState {
  paso: 1 | 2 | 3;
  companyId: string | null;

  /* paso 1 — cliente */
  customerId: string | null;
  docTipo: number;
  docNro: string;
  receptorRazonSocial: string;
  receptorDomicilio: string;
  condicionIvaReceptorId: number;

  /* paso 2 — comprobante */
  cbteTipo: number | null; // null = usamos el que sugiere el backend
  ptoVta: number;
  concepto: number;
  fechaCbte: string;
  fchServDesde: string;
  fchServHasta: string;
  fchVtoPago: string;
  monId: string;
  monCotiz: number;
  preciosConIva: boolean;
  items: ItemWizard[];
  tributos: TributoWizard[];
  observaciones: string;
}

let contador = 0;
export function nuevaKey(): string {
  contador += 1;
  return `f${Date.now().toString(36)}${contador}`;
}

export function itemVacio(ivaId = 5): ItemWizard {
  return {
    key: nuevaKey(),
    productId: null,
    descripcion: '',
    cantidad: 1,
    unidad: 'unidad',
    precioUnitario: 0,
    bonificacion: 0,
    ivaId,
  };
}

export function estadoInicial(companyId: string | null, ptoVta = 1): WizardState {
  return {
    paso: 1,
    companyId,
    customerId: null,
    docTipo: 80,
    docNro: '',
    receptorRazonSocial: '',
    receptorDomicilio: '',
    condicionIvaReceptorId: 5,
    cbteTipo: null,
    ptoVta,
    concepto: 1,
    fechaCbte: hoyISO(),
    fchServDesde: '',
    fchServHasta: '',
    fchVtoPago: '',
    monId: 'PES',
    monCotiz: 1,
    preciosConIva: false,
    items: [itemVacio()],
    tributos: [],
    observaciones: '',
  };
}

/** Ítems con contenido real (los renglones vacíos no se mandan). */
export function itemsUtiles(state: WizardState): ItemWizard[] {
  return state.items.filter(
    (i) => i.descripcion.trim().length > 0 && i.cantidad > 0 && i.precioUnitario >= 0,
  );
}

/** Arma el body de `POST /api/invoices` (y de `/preview`, que es el mismo). */
export function armarInvoiceInput(
  state: WizardState,
  companyId: string,
): InvoiceInput | null {
  const items = itemsUtiles(state);
  if (items.length === 0) return null;

  const itemsApi: InvoiceItemInput[] = items.map((i) => ({
    productId: i.productId,
    descripcion: i.descripcion.trim(),
    cantidad: i.cantidad,
    unidad: i.unidad,
    precioUnitario: i.precioUnitario,
    bonificacion: i.bonificacion,
    ivaId: i.ivaId,
    precioConIva: state.preciosConIva,
  }));

  const tributosApi: TributoInput[] = state.tributos
    .filter((t) => t.baseImp > 0 && t.alicuota > 0)
    .map((t) => ({
      tributoId: t.tributoId,
      descripcion: t.descripcion.trim() || 'Otros tributos',
      baseImp: t.baseImp,
      alicuota: t.alicuota,
    }));

  const consumidorFinal = state.docTipo === 99;

  const body: InvoiceInput = {
    companyId,
    ptoVta: state.ptoVta,
    concepto: state.concepto,
    docTipo: state.docTipo,
    docNro: consumidorFinal ? '0' : soloDigitos(state.docNro),
    condicionIvaReceptorId: state.condicionIvaReceptorId,
    fechaCbte: state.fechaCbte,
    monId: state.monId,
    monCotiz: state.monCotiz,
    items: itemsApi,
  };

  if (state.cbteTipo !== null) body.cbteTipo = state.cbteTipo;
  if (state.customerId) body.customerId = state.customerId;
  if (state.receptorRazonSocial.trim()) {
    body.receptorRazonSocial = state.receptorRazonSocial.trim();
  } else if (consumidorFinal) {
    body.receptorRazonSocial = 'Consumidor Final';
  }
  if (state.receptorDomicilio.trim()) body.receptorDomicilio = state.receptorDomicilio.trim();
  if (state.concepto === 2 || state.concepto === 3) {
    if (state.fchServDesde) body.fchServDesde = state.fchServDesde;
    if (state.fchServHasta) body.fchServHasta = state.fchServHasta;
    if (state.fchVtoPago) body.fchVtoPago = state.fchVtoPago;
  }
  if (tributosApi.length > 0) body.tributos = tributosApi;
  if (state.observaciones.trim()) body.observaciones = state.observaciones.trim();

  return body;
}

/** Errores que impiden avanzar del paso 1. */
export function validarPaso1(state: WizardState): string[] {
  const errores: string[] = [];
  if (state.docTipo !== 99) {
    const d = soloDigitos(state.docNro);
    if (!d) errores.push('Ingresá el documento del receptor.');
    if (!state.receptorRazonSocial.trim() && !state.customerId) {
      errores.push('Ingresá la razón social o el nombre del receptor.');
    }
  }
  if (!state.condicionIvaReceptorId) {
    errores.push('Elegí la condición del receptor frente al IVA.');
  }
  return errores;
}

/** Errores que impiden avanzar del paso 2. */
export function validarPaso2(state: WizardState): string[] {
  const errores: string[] = [];
  if (!state.ptoVta || state.ptoVta < 1) errores.push('Indicá el punto de venta.');
  if (!state.fechaCbte) errores.push('Indicá la fecha del comprobante.');
  if (state.concepto === 2 || state.concepto === 3) {
    if (!state.fchServDesde || !state.fchServHasta) {
      errores.push('El concepto incluye servicios: cargá el período facturado (desde y hasta).');
    } else if (state.fchServDesde > state.fchServHasta) {
      errores.push('El período de servicio termina antes de empezar.');
    }
    if (!state.fchVtoPago) {
      errores.push('El concepto incluye servicios: cargá el vencimiento de pago.');
    }
  }
  const items = itemsUtiles(state);
  if (items.length === 0) errores.push('Cargá al menos un ítem con descripción y cantidad.');
  if (items.some((i) => i.precioUnitario <= 0)) {
    errores.push('Hay ítems con precio unitario en cero.');
  }
  if (state.monId !== 'PES' && (!state.monCotiz || state.monCotiz <= 0)) {
    errores.push('Indicá la cotización de la moneda.');
  }
  return errores;
}
