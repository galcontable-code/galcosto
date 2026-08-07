/**
 * Codigo QR obligatorio en los comprobantes electronicos (RG 4892/2020).
 *
 * ARCA define un JSON con los datos del comprobante, codificado en base64 y
 * concatenado a https://www.afip.gob.ar/fe/qr/?p=
 *
 * Ese JSON tiene una forma fija (version 1):
 *   { ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, moneda, ctz,
 *     tipoDocRec, nroDocRec, tipoCodAut, codAut }
 */

import QRCode from 'qrcode';
import { config } from '../config.js';

export interface QrInput {
  /** Version del formato. Siempre 1; se acepta por comodidad del llamador. */
  ver?: 1;
  /** Fecha del comprobante: Date, "yyyy-mm-dd" o "yyyymmdd". */
  fecha: Date | string;
  /** CUIT del emisor (con o sin guiones). */
  cuit: string | number;
  ptoVta: number;
  /** Tipo de comprobante ARCA (1, 6, 11, ...). */
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  /** Moneda del comprobante (PES, DOL, ...). */
  moneda: string;
  /** Cotizacion en pesos de la moneda. */
  ctz: number;
  tipoDocRec?: number;
  nroDocRec?: number | string;
  /** 'E' para CAE (electronico), 'A' para CAEA. */
  tipoCodAut?: 'E' | 'A';
  /** CAE o CAEA. */
  codAut: string | number;
}

/** JSON del QR, exactamente con las claves y el orden que define ARCA. */
export interface QrPayload {
  ver: 1;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: 'E' | 'A';
  codAut: number;
}

/** Deja solo digitos (CUIT, DNI y CAE viajan como numeros en el QR). */
function soloDigitos(valor: string | number | undefined | null): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\D/g, '');
}

function aNumero(valor: string | number | undefined | null): number {
  const digitos = soloDigitos(valor);
  if (digitos === '') return 0;
  const n = Number(digitos);
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza la fecha a "yyyy-mm-dd", que es el formato que pide el QR. */
function formatearFecha(fecha: Date | string): string {
  if (fecha instanceof Date) {
    if (Number.isNaN(fecha.getTime())) throw new Error('La fecha del comprobante es invalida');
    const anio = fecha.getUTCFullYear();
    const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getUTCDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }
  const texto = String(fecha).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  if (/^\d{8}$/.test(texto)) {
    return `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}`;
  }
  // Ultimo recurso: ISO con hora.
  const parseada = new Date(texto);
  if (Number.isNaN(parseada.getTime())) {
    throw new Error(`Fecha invalida para el QR: ${texto}`);
  }
  return parseada.toISOString().slice(0, 10);
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Arma el JSON del QR (sin codificar). Se guarda en Invoice.qrPayload para
 * poder regenerar el QR en cualquier momento.
 */
export function buildQrPayload(data: QrInput): QrPayload {
  const importe = Number(data.importe);
  if (!Number.isFinite(importe)) throw new Error('El importe del QR debe ser numerico');
  const ctz = Number(data.ctz);

  return {
    ver: 1,
    fecha: formatearFecha(data.fecha),
    cuit: aNumero(data.cuit),
    ptoVta: Number(data.ptoVta) || 0,
    tipoCmp: Number(data.tipoCmp) || 0,
    nroCmp: Number(data.nroCmp) || 0,
    importe: round2(importe),
    moneda: data.moneda || 'PES',
    ctz: Number.isFinite(ctz) && ctz > 0 ? round2(ctz) : 1,
    tipoDocRec: Number(data.tipoDocRec ?? 0) || 0,
    nroDocRec: aNumero(data.nroDocRec),
    tipoCodAut: data.tipoCodAut ?? 'E',
    codAut: aNumero(data.codAut),
  };
}

/**
 * URL completa del QR: base de ARCA + el JSON en base64.
 * El base64 se concatena tal cual (asi lo especifica ARCA, sin url-encode).
 */
export function buildQrUrl(data: QrInput): string {
  const payload = buildQrPayload(data);
  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `${config.arca.qrBase}${base64}`;
}

/** Decodifica una URL de QR de ARCA. Util para tests y soporte. */
export function parseQrUrl(url: string): QrPayload {
  const idx = url.indexOf('?p=');
  const base64 = idx >= 0 ? url.slice(idx + 3) : url;
  const json = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(json) as QrPayload;
}

/** Renderiza el QR como PNG, para incrustarlo en el PDF del comprobante. */
export async function renderQrPng(url: string): Promise<Buffer> {
  if (!url) throw new Error('No se puede generar el QR sin una URL');
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
}
