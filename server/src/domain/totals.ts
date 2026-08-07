/**
 * Calculo de importes del comprobante.
 *
 * Reglas que ARCA valida y que aca se respetan:
 *  - ImpTotal = ImpNeto + ImpIVA + ImpTotConc + ImpOpEx + ImpTrib
 *  - La suma de Iva[].BaseImp debe coincidir con ImpNeto (para comprobantes
 *    que discriminan IVA).
 *  - La suma de Iva[].Importe debe coincidir con ImpIVA.
 *  - En comprobantes clase B y C no se discrimina IVA hacia el receptor, pero
 *    la clase B SI lo informa a ARCA; la clase C NO (ImpIVA = 0 y todo el
 *    importe va a ImpNeto).
 *  - Todos los importes se redondean a 2 decimales.
 *
 * Toda la aritmetica se hace en centavos enteros para evitar el error de
 * coma flotante que hace que ARCA rechace el comprobante por diferencias de
 * un centavo.
 */

import { alicuotaIva, discriminaIva, letraDeComprobante } from './catalogs.js';
import type { ArcaIvaLine, ArcaTributoLine } from './arca-port.js';

export interface LineInput {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** Porcentaje de bonificacion sobre la linea (0-100). */
  bonificacion?: number;
  ivaId: number;
  /** true si precioUnitario ya trae el IVA adentro. */
  precioConIva?: boolean;
}

export interface LineTotals {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  bonificacion: number;
  ivaId: number;
  alicuota: number;
  /** Neto de la linea, ya descontada la bonificacion. */
  subtotalNeto: number;
  importeIva: number;
  subtotalConIva: number;
}

export interface TributoInput {
  tributoId: number;
  descripcion: string;
  baseImp: number;
  alicuota: number;
}

export interface InvoiceTotals {
  items: LineTotals[];
  impNeto: number;
  impIVA: number;
  impTotConc: number;
  impOpEx: number;
  impTrib: number;
  impTotal: number;
  /** Alicuotas agrupadas, listas para mandar a WSFEv1. */
  iva: ArcaIvaLine[];
  tributos: ArcaTributoLine[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Convierte a centavos enteros. */
const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100);
const fromCents = (c: number): number => c / 100;

/**
 * Calcula una linea. Si el precio viene con IVA incluido, se hace el camino
 * inverso para obtener el neto: neto = bruto / (1 + alicuota/100).
 */
export function calcularLinea(line: LineInput, cbteTipo: number): LineTotals {
  const alicuota = alicuotaIva(line.ivaId);
  const bonificacion = line.bonificacion ?? 0;

  if (line.cantidad < 0) throw new Error('La cantidad no puede ser negativa');
  if (line.precioUnitario < 0) throw new Error('El precio unitario no puede ser negativo');
  if (bonificacion < 0 || bonificacion > 100) {
    throw new Error('La bonificacion debe estar entre 0 y 100');
  }

  // Bruto de la linea segun venga el precio.
  const brutoSinBonif = line.precioUnitario * line.cantidad;
  const bruto = brutoSinBonif * (1 - bonificacion / 100);

  let netoCents: number;
  let ivaCents: number;

  // Los comprobantes clase C no liquidan IVA: el precio es el total.
  if (!discriminaIvaEnLinea(cbteTipo)) {
    netoCents = cents(bruto);
    ivaCents = 0;
  } else if (line.precioConIva) {
    const netoExacto = bruto / (1 + alicuota / 100);
    netoCents = cents(netoExacto);
    ivaCents = cents(bruto) - netoCents;
  } else {
    netoCents = cents(bruto);
    ivaCents = cents(fromCents(netoCents) * (alicuota / 100));
  }

  return {
    descripcion: line.descripcion,
    cantidad: line.cantidad,
    precioUnitario: round2(line.precioUnitario),
    bonificacion,
    ivaId: line.ivaId,
    alicuota,
    subtotalNeto: fromCents(netoCents),
    importeIva: fromCents(ivaCents),
    subtotalConIva: fromCents(netoCents + ivaCents),
  };
}

/**
 * En clase C el IVA no se liquida (ImpIVA = 0). En clase A, B y M si se
 * informa a ARCA, aunque en B/C no se discrimine en el impreso.
 */
function discriminaIvaEnLinea(cbteTipo: number): boolean {
  return letraDeComprobante(cbteTipo) !== 'C';
}

/**
 * Calcula los totales del comprobante completo y arma el array de alicuotas
 * agrupado por Id, que es lo que WSFEv1 espera.
 */
export function calcularTotales(
  lines: LineInput[],
  cbteTipo: number,
  tributos: TributoInput[] = [],
): InvoiceTotals {
  if (lines.length === 0) throw new Error('El comprobante necesita al menos un item');

  const items = lines.map((l) => calcularLinea(l, cbteTipo));

  // Agrupacion por alicuota, sumando en centavos.
  const porAlicuota = new Map<number, { base: number; importe: number }>();
  for (const item of items) {
    const acc = porAlicuota.get(item.ivaId) ?? { base: 0, importe: 0 };
    acc.base += cents(item.subtotalNeto);
    acc.importe += cents(item.importeIva);
    porAlicuota.set(item.ivaId, acc);
  }

  let netoCents = 0;
  let ivaCents = 0;
  const iva: ArcaIvaLine[] = [];

  for (const [id, acc] of [...porAlicuota.entries()].sort((a, b) => a[0] - b[0])) {
    netoCents += acc.base;
    ivaCents += acc.importe;
    iva.push({
      Id: id,
      BaseImp: fromCents(acc.base),
      Importe: fromCents(acc.importe),
    });
  }

  const tributosCalc: ArcaTributoLine[] = tributos.map((t) => ({
    Id: t.tributoId,
    Desc: t.descripcion,
    BaseImp: round2(t.baseImp),
    Alic: t.alicuota,
    Importe: fromCents(cents(t.baseImp * (t.alicuota / 100))),
  }));

  const tribCents = tributosCalc.reduce((sum, t) => sum + cents(t.Importe), 0);
  const totalCents = netoCents + ivaCents + tribCents;

  return {
    items,
    impNeto: fromCents(netoCents),
    impIVA: fromCents(ivaCents),
    impTotConc: 0,
    impOpEx: 0,
    impTrib: fromCents(tribCents),
    impTotal: fromCents(totalCents),
    // Clase C no manda el array de alicuotas.
    iva: discriminaIvaEnLinea(cbteTipo) ? iva : [],
    tributos: tributosCalc,
  };
}

/**
 * Valida la coherencia que ARCA verifica antes de otorgar el CAE.
 * Devuelve la lista de problemas encontrados (vacia si esta todo bien).
 */
export function validarTotales(t: InvoiceTotals): string[] {
  const problemas: string[] = [];

  const suma = round2(t.impNeto + t.impIVA + t.impTotConc + t.impOpEx + t.impTrib);
  if (suma !== round2(t.impTotal)) {
    problemas.push(
      `ImpTotal (${t.impTotal}) no coincide con la suma de los componentes (${suma})`,
    );
  }

  if (t.iva.length > 0) {
    const baseIva = round2(t.iva.reduce((s, i) => s + i.BaseImp, 0));
    if (baseIva !== round2(t.impNeto)) {
      problemas.push(
        `La suma de bases imponibles (${baseIva}) no coincide con ImpNeto (${t.impNeto})`,
      );
    }
    const importeIva = round2(t.iva.reduce((s, i) => s + i.Importe, 0));
    if (importeIva !== round2(t.impIVA)) {
      problemas.push(
        `La suma de IVA por alicuota (${importeIva}) no coincide con ImpIVA (${t.impIVA})`,
      );
    }
  }

  if (t.impTotal <= 0) {
    problemas.push('El importe total debe ser mayor a cero');
  }

  return problemas;
}

export { round2 };
