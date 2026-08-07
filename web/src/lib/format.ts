/**
 * Formateo y validación con las convenciones argentinas (es-AR).
 *
 * Moneda: `$ 1.234,56` · Fechas: `dd/mm/aaaa` · CUIT: `20-11111111-2`
 * Número de comprobante: `0001-00000042`
 */

const monedaAR = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numeroAR = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `$ 1.234,56`. Acepta null/undefined y devuelve `$ 0,00`. */
export function formatMoney(valor: number | null | undefined, simbolo = '$'): string {
  const n = Number.isFinite(valor) ? (valor as number) : 0;
  const signo = n < 0 ? '-' : '';
  return `${signo}${simbolo} ${monedaAR.format(Math.abs(n))}`;
}

/** Igual que formatMoney pero sin símbolo, para grillas densas. */
export function formatAmount(valor: number | null | undefined): string {
  return monedaAR.format(Number.isFinite(valor) ? (valor as number) : 0);
}

export function formatNumber(valor: number | null | undefined): string {
  return numeroAR.format(Number.isFinite(valor) ? (valor as number) : 0);
}

export function formatPercent(valor: number | null | undefined): string {
  const n = Number.isFinite(valor) ? (valor as number) : 0;
  return `${numeroAR.format(n)}%`;
}

/** Símbolo de la moneda ARCA. */
export function simboloMoneda(monId: string): string {
  switch (monId) {
    case 'DOL':
      return 'US$';
    case '060':
      return '€';
    case '012':
      return 'R$';
    default:
      return '$';
  }
}

/* ------------------------------------------------------------- fechas */

/** Parsea `2026-08-07` o un ISO completo sin correrse de día por zona horaria. */
export function parseFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloFecha) {
    return new Date(
      Number(soloFecha[1]),
      Number(soloFecha[2]) - 1,
      Number(soloFecha[3]),
      12,
      0,
      0,
    );
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `dd/mm/aaaa`. */
export function formatDate(valor: string | Date | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** `dd/mm/aaaa HH:mm`. */
export function formatDateTime(valor: string | Date | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)} ${hh}:${mi}`;
}

/** `aaaa-mm-dd` para inputs `type="date"`. */
export function toInputDate(valor: string | Date | null | undefined): string {
  const d = parseFecha(valor);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function hoyISO(): string {
  return toInputDate(new Date());
}

/** Primer y último día del mes de la fecha dada, en formato input. */
export function rangoDelMes(base: Date = new Date()): { desde: string; hasta: string } {
  const desde = new Date(base.getFullYear(), base.getMonth(), 1);
  const hasta = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { desde: toInputDate(desde), hasta: toInputDate(hasta) };
}

/** Suma días a una fecha en formato input y devuelve formato input. */
export function sumarDias(fechaInput: string, dias: number): string {
  const d = parseFecha(fechaInput);
  if (!d) return '';
  d.setDate(d.getDate() + dias);
  return toInputDate(d);
}

/** "en 5 días" / "vencido hace 2 días" para el vencimiento del CAE. */
export function diasHasta(valor: string | Date | null | undefined): number | null {
  const d = parseFecha(valor);
  if (!d) return null;
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
}

/* --------------------------------------------------------------- CUIT */

/** Deja sólo los dígitos. */
export function soloDigitos(valor: string): string {
  return valor.replace(/\D+/g, '');
}

/** `20-11111111-2`. Si no tiene 11 dígitos devuelve lo que haya. */
export function formatCuit(valor: string | null | undefined): string {
  if (!valor) return '—';
  const d = soloDigitos(valor);
  if (d.length !== 11) return valor;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/**
 * Validación de CUIT/CUIL por dígito verificador (módulo 11).
 * Los pesos van del 5 al 2 y vuelven a empezar, sobre los primeros 10 dígitos.
 */
export function validarCuit(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const d = soloDigitos(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(d[i]) * pesos[i];

  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  else if (verificador === 10) verificador = 9;

  return verificador === Number(d[10]);
}

/** Valida el documento según el tipo de ARCA (80 CUIT, 86 CUIL, 96 DNI, 99 CF). */
export function validarDocumento(docTipo: number, docNro: string): string | null {
  const d = soloDigitos(docNro);
  if (docTipo === 99) return null; // Consumidor final: sin documento
  if (!d) return 'Ingresá el número de documento.';
  if (docTipo === 80 || docTipo === 86) {
    if (d.length !== 11) return 'El CUIT/CUIL tiene que tener 11 dígitos.';
    if (!validarCuit(d)) return 'El dígito verificador no es válido. Revisá el número.';
    return null;
  }
  if (docTipo === 96) {
    if (d.length < 7 || d.length > 8) return 'El DNI tiene que tener 7 u 8 dígitos.';
    return null;
  }
  return null;
}

/** Máscara en vivo mientras se tipea un CUIT. */
export function enmascararCuit(valor: string): string {
  const d = soloDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/* ------------------------------------------------- número de comprobante */

/** `0001-00000042`. */
export function formatComprobante(
  ptoVta: number | null | undefined,
  nro: number | null | undefined,
): string {
  const pv = String(ptoVta ?? 0).padStart(4, '0');
  const n = String(nro ?? 0).padStart(8, '0');
  return `${pv}-${n}`;
}

/** Corta un texto largo agregando elipsis. */
export function truncar(texto: string, largo: number): string {
  if (texto.length <= largo) return texto;
  return `${texto.slice(0, largo - 1)}…`;
}

/** Parsea un importe tipeado en formato local (`1.234,56` o `1234.56`). */
export function parseImporte(valor: string): number {
  const limpio = valor.trim().replace(/\s/g, '');
  if (!limpio) return 0;
  // Si tiene coma, la coma es el separador decimal.
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
