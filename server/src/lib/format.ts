/**
 * Formateo y serializacion.
 *
 * Reglas de fechas: en el comprobante la fecha es un dato *civil* (no un
 * instante), asi que se guarda siempre como medianoche UTC y se lee siempre
 * con los getters UTC. De esa forma la fecha no se corre segun la zona horaria
 * del servidor, que es el clasico bug de "la factura salio con la fecha de
 * ayer".
 */

import { descripcionComprobante, letraDeComprobante } from '../domain/catalogs.js';

/* -------------------------------------------------------------------------- */
/* Fechas                                                                      */
/* -------------------------------------------------------------------------- */

const RE_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-08-07" -> Date en medianoche UTC. */
export function parsearFechaIso(iso: string): Date {
  const m = RE_FECHA_ISO.exec(iso.trim());
  if (!m) throw new Error(`Fecha invalida: "${iso}". Se espera el formato AAAA-MM-DD.`);
  const fecha = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) throw new Error(`Fecha invalida: "${iso}"`);
  return fecha;
}

/** Date -> "2026-08-07". */
export function aFechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Date -> "20260807", el formato que pide WSFEv1. */
export function aFechaArca(fecha: Date): string {
  return aFechaIso(fecha).replace(/-/g, '');
}

/** "20260807" -> Date en medianoche UTC. */
export function desdeFechaArca(valor: string): Date {
  const limpio = valor.trim();
  if (!/^\d{8}$/.test(limpio)) throw new Error(`Fecha ARCA invalida: "${valor}"`);
  return parsearFechaIso(
    `${limpio.slice(0, 4)}-${limpio.slice(4, 6)}-${limpio.slice(6, 8)}`,
  );
}

/** Date -> "07/08/2026". */
export function formatearFecha(fecha: Date | null | undefined): string {
  if (!fecha) return '-';
  const iso = aFechaIso(fecha);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Fecha civil de hoy (medianoche UTC). */
export function hoyUtc(): Date {
  return parsearFechaIso(new Date().toISOString().slice(0, 10));
}

/** Suma dias a una fecha civil. */
export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Numeros y documentos                                                        */
/* -------------------------------------------------------------------------- */

const FORMATO_MONEDA = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234567.5 -> "1.234.567,50" (sin simbolo). */
export function formatearImporte(valor: number): string {
  return FORMATO_MONEDA.format(Number.isFinite(valor) ? valor : 0);
}

/** 1234567.5 -> "$ 1.234.567,50". */
export function formatearMoneda(valor: number, simbolo = '$'): string {
  return `${simbolo} ${formatearImporte(valor)}`;
}

const FORMATO_CANTIDAD = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatearCantidad(valor: number): string {
  return FORMATO_CANTIDAD.format(Number.isFinite(valor) ? valor : 0);
}

/** (1, 42) -> "0001-00000042". */
export function formatearNumeroComprobante(ptoVta: number, cbteNro: number | null): string {
  const pv = String(ptoVta).padStart(4, '0');
  const nro = String(cbteNro ?? 0).padStart(8, '0');
  return `${pv}-${nro}`;
}

/** "20111111112" -> "20-11111111-2". */
export function formatearCuit(cuit: string): string {
  const limpio = soloDigitos(cuit);
  if (limpio.length !== 11) return cuit;
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
}

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** Muestra el documento del receptor segun el tipo. */
export function formatearDocumento(docTipo: number, docNro: string): string {
  if (docTipo === 99) return 'Consumidor Final';
  if (docTipo === 80 || docTipo === 86) return formatearCuit(docNro);
  return docNro;
}

/* -------------------------------------------------------------------------- */
/* Serializadores                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Datos de la empresa que se pueden mandar al cliente.
 * NUNCA se incluyen `certPemEnc` ni `keyPemEnc`: solo metadatos del
 * certificado (subject, vencimiento, si esta cargado).
 */
export interface EmpresaSerializada {
  id: string;
  razonSocial: string;
  nombreFantasia: string | null;
  cuit: string;
  cuitFormateado: string;
  condicionIva: string;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  ingresosBrutos: string | null;
  inicioActividades: string | null;
  logoDataUrl: string | null;
  environment: string;
  defaultPtoVta: number;
  active: boolean;
  tieneCredenciales: boolean;
  certSubject: string | null;
  certUploadedAt: string | null;
  certExpiresAt: string | null;
  certVencido: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Campos de Company que necesita el serializador. */
export interface EmpresaFuente {
  id: string;
  razonSocial: string;
  nombreFantasia: string | null;
  cuit: string;
  condicionIva: string;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  ingresosBrutos: string | null;
  inicioActividades: Date | null;
  logoDataUrl: string | null;
  environment: string;
  defaultPtoVta: number;
  active: boolean;
  certPemEnc: string | null;
  keyPemEnc: string | null;
  certSubject: string | null;
  certUploadedAt: Date | null;
  certExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializarEmpresa(empresa: EmpresaFuente): EmpresaSerializada {
  return {
    id: empresa.id,
    razonSocial: empresa.razonSocial,
    nombreFantasia: empresa.nombreFantasia,
    cuit: empresa.cuit,
    cuitFormateado: formatearCuit(empresa.cuit),
    condicionIva: empresa.condicionIva,
    domicilio: empresa.domicilio,
    localidad: empresa.localidad,
    provincia: empresa.provincia,
    ingresosBrutos: empresa.ingresosBrutos,
    inicioActividades: empresa.inicioActividades ? aFechaIso(empresa.inicioActividades) : null,
    logoDataUrl: empresa.logoDataUrl,
    environment: empresa.environment,
    defaultPtoVta: empresa.defaultPtoVta,
    active: empresa.active,
    tieneCredenciales: Boolean(empresa.certPemEnc && empresa.keyPemEnc),
    certSubject: empresa.certSubject,
    certUploadedAt: empresa.certUploadedAt?.toISOString() ?? null,
    certExpiresAt: empresa.certExpiresAt?.toISOString() ?? null,
    certVencido: empresa.certExpiresAt ? empresa.certExpiresAt.getTime() < Date.now() : false,
    createdAt: empresa.createdAt.toISOString(),
    updatedAt: empresa.updatedAt.toISOString(),
  };
}

/** Etiqueta larga del comprobante: "Factura C 0001-00000042". */
export function etiquetaComprobante(
  cbteTipo: number,
  ptoVta: number,
  cbteNro: number | null,
): string {
  return `${descripcionComprobante(cbteTipo)} ${formatearNumeroComprobante(ptoVta, cbteNro)}`;
}

export { letraDeComprobante };
