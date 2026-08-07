/**
 * Catalogos oficiales de ARCA (ex AFIP).
 *
 * Son la fuente de verdad compartida entre la integracion con los web
 * services, la API y el frontend. Los ids son los que ARCA espera en WSFEv1;
 * no inventar valores nuevos.
 */

export interface CatalogEntry<T = number> {
  id: T;
  desc: string;
}

/** Tipos de comprobante (FEParamGetTiposCbte). */
export const TIPOS_COMPROBANTE: CatalogEntry[] = [
  { id: 1, desc: 'Factura A' },
  { id: 2, desc: 'Nota de Debito A' },
  { id: 3, desc: 'Nota de Credito A' },
  { id: 6, desc: 'Factura B' },
  { id: 7, desc: 'Nota de Debito B' },
  { id: 8, desc: 'Nota de Credito B' },
  { id: 11, desc: 'Factura C' },
  { id: 12, desc: 'Nota de Debito C' },
  { id: 13, desc: 'Nota de Credito C' },
  { id: 51, desc: 'Factura M' },
  { id: 52, desc: 'Nota de Debito M' },
  { id: 53, desc: 'Nota de Credito M' },
  { id: 201, desc: 'Factura de Credito MiPyME A' },
  { id: 202, desc: 'Nota de Debito MiPyME A' },
  { id: 203, desc: 'Nota de Credito MiPyME A' },
  { id: 206, desc: 'Factura de Credito MiPyME B' },
  { id: 207, desc: 'Nota de Debito MiPyME B' },
  { id: 208, desc: 'Nota de Credito MiPyME B' },
  { id: 211, desc: 'Factura de Credito MiPyME C' },
  { id: 212, desc: 'Nota de Debito MiPyME C' },
  { id: 213, desc: 'Nota de Credito MiPyME C' },
];

/** Letra del comprobante, derivada del tipo. */
export function letraDeComprobante(cbteTipo: number): 'A' | 'B' | 'C' | 'M' | '-' {
  if ([1, 2, 3, 201, 202, 203].includes(cbteTipo)) return 'A';
  if ([6, 7, 8, 206, 207, 208].includes(cbteTipo)) return 'B';
  if ([11, 12, 13, 211, 212, 213].includes(cbteTipo)) return 'C';
  if ([51, 52, 53].includes(cbteTipo)) return 'M';
  return '-';
}

export function esNotaDeCredito(cbteTipo: number): boolean {
  return [3, 8, 13, 53, 203, 208, 213].includes(cbteTipo);
}

export function esNotaDeDebito(cbteTipo: number): boolean {
  return [2, 7, 12, 52, 202, 207, 212].includes(cbteTipo);
}

/**
 * Los comprobantes clase C (emisor monotributista o exento) no discriminan
 * IVA: el total va integro a ImpNeto y ImpIVA debe ser 0.
 */
export function discriminaIva(cbteTipo: number): boolean {
  const letra = letraDeComprobante(cbteTipo);
  return letra === 'A' || letra === 'M';
}

/** Tipos de documento del receptor (FEParamGetTiposDoc). */
export const TIPOS_DOCUMENTO: CatalogEntry[] = [
  { id: 80, desc: 'CUIT' },
  { id: 86, desc: 'CUIL' },
  { id: 96, desc: 'DNI' },
  { id: 99, desc: 'Consumidor Final' },
  { id: 87, desc: 'CDI' },
  { id: 89, desc: 'LE' },
  { id: 90, desc: 'LC' },
  { id: 91, desc: 'CI Extranjera' },
  { id: 94, desc: 'Pasaporte' },
];

/** Alicuotas de IVA (FEParamGetTiposIva). */
export const ALICUOTAS_IVA: Array<CatalogEntry & { rate: number }> = [
  { id: 3, desc: '0%', rate: 0 },
  { id: 9, desc: '2,5%', rate: 2.5 },
  { id: 8, desc: '5%', rate: 5 },
  { id: 4, desc: '10,5%', rate: 10.5 },
  { id: 5, desc: '21%', rate: 21 },
  { id: 6, desc: '27%', rate: 27 },
];

export function alicuotaIva(ivaId: number): number {
  const found = ALICUOTAS_IVA.find((a) => a.id === ivaId);
  if (!found) throw new Error(`Alicuota de IVA desconocida: ${ivaId}`);
  return found.rate;
}

/**
 * Condicion frente al IVA del receptor (RG 5616/2024).
 * Obligatorio en todos los comprobantes desde 2025.
 */
export const CONDICIONES_IVA_RECEPTOR: CatalogEntry[] = [
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
];

/** Conceptos a facturar. */
export const CONCEPTOS: CatalogEntry[] = [
  { id: 1, desc: 'Productos' },
  { id: 2, desc: 'Servicios' },
  { id: 3, desc: 'Productos y Servicios' },
];

/** Cuando el concepto incluye servicios, ARCA exige el periodo facturado. */
export function requierePeriodoServicio(concepto: number): boolean {
  return concepto === 2 || concepto === 3;
}

/** Monedas mas usadas (el listado completo se trae de FEParamGetTiposMonedas). */
export const MONEDAS: Array<CatalogEntry<string>> = [
  { id: 'PES', desc: 'Pesos Argentinos' },
  { id: 'DOL', desc: 'Dolar Estadounidense' },
  { id: '060', desc: 'Euro' },
  { id: '012', desc: 'Real' },
];

/** Otros tributos (FEParamGetTiposTributos). */
export const TIPOS_TRIBUTO: CatalogEntry[] = [
  { id: 1, desc: 'Impuestos nacionales' },
  { id: 2, desc: 'Impuestos provinciales' },
  { id: 3, desc: 'Impuestos municipales' },
  { id: 4, desc: 'Impuestos internos' },
  { id: 99, desc: 'Otros' },
];

/**
 * Que tipo de comprobante corresponde emitir, segun la condicion IVA del
 * emisor y la del receptor.
 *
 * - Emisor monotributista o exento -> siempre clase C.
 * - Emisor responsable inscripto -> A si el receptor es RI/Monotributo,
 *   B en el resto de los casos (consumidor final, exento, no categorizado).
 */
export function tipoComprobanteSugerido(
  condicionIvaEmisor: string,
  condicionIvaReceptorId: number,
): number {
  if (condicionIvaEmisor === 'MONOTRIBUTO' || condicionIvaEmisor === 'EXENTO') {
    return 11; // Factura C
  }
  // Responsable inscripto: A solo contra RI o Monotributo.
  if (condicionIvaReceptorId === 1 || condicionIvaReceptorId === 6) return 1;
  return 6; // Factura B
}

/** Nota de credito que corresponde a un comprobante dado. */
export function notaDeCreditoPara(cbteTipo: number): number {
  const map: Record<number, number> = {
    1: 3, 2: 3, 6: 8, 7: 8, 11: 13, 12: 13, 51: 53, 52: 53,
    201: 203, 202: 203, 206: 208, 207: 208, 211: 213, 212: 213,
  };
  const nc = map[cbteTipo];
  if (!nc) throw new Error(`No hay nota de credito definida para el tipo ${cbteTipo}`);
  return nc;
}

/** Nota de debito que corresponde a un comprobante dado. */
export function notaDeDebitoPara(cbteTipo: number): number {
  const map: Record<number, number> = {
    1: 2, 3: 2, 6: 7, 8: 7, 11: 12, 13: 12, 51: 52, 53: 52,
    201: 202, 203: 202, 206: 207, 208: 207, 211: 212, 213: 212,
  };
  const nd = map[cbteTipo];
  if (!nd) throw new Error(`No hay nota de debito definida para el tipo ${cbteTipo}`);
  return nd;
}

export function descripcionComprobante(cbteTipo: number): string {
  return TIPOS_COMPROBANTE.find((t) => t.id === cbteTipo)?.desc ?? `Tipo ${cbteTipo}`;
}

export function descripcionTipoDoc(docTipo: number): string {
  return TIPOS_DOCUMENTO.find((t) => t.id === docTipo)?.desc ?? `Tipo ${docTipo}`;
}

export function descripcionCondicionIva(id: number): string {
  return CONDICIONES_IVA_RECEPTOR.find((c) => c.id === id)?.desc ?? `Condicion ${id}`;
}
