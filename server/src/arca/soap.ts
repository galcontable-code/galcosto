/**
 * Helper generico para hablar SOAP con los web services de ARCA.
 *
 * Se encarga de:
 *   - armar el sobre SOAP 1.1 / 1.2,
 *   - aplicar el timeout de `config.arca.timeoutMs` con AbortSignal,
 *   - reintentar con backoff SOLO ante errores de red o 5xx sin Fault
 *     (nunca ante rechazos de negocio, que no son reintentables),
 *   - parsear la respuesta con fast-xml-parser quitando los prefijos de
 *     namespace, y devolver tambien el XML crudo para auditoria.
 */

import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.js';
import { ArcaError, mapSoapFault } from './errors.js';

export type SoapVersion = '1.1' | '1.2';

export interface SoapCallOptions {
  /** Endpoint completo del servicio. */
  url: string;
  /** Cuerpo que va adentro de <soap:Body> (ya serializado). */
  body: string;
  /** Valor del header SOAPAction (SOAP 1.1) o del parametro action (SOAP 1.2). */
  action?: string;
  version?: SoapVersion;
  timeoutMs?: number;
  /** Reintentos adicionales ante fallas de red. Por defecto 2. */
  retries?: number;
  /** Nombre de la operacion, solo para los logs. */
  label?: string;
  /** Namespaces extra a declarar en el sobre. */
  namespaces?: Record<string, string>;
}

export interface SoapResponse {
  /** XML crudo devuelto por ARCA. */
  raw: string;
  /** XML crudo enviado (con Token/Sign enmascarados). */
  requestXml: string;
  /** Respuesta parseada, sin prefijos de namespace. */
  parsed: SoapNode;
  status: number;
  /** Milisegundos que tardo la llamada (ultimo intento). */
  durationMs: number;
}

export type SoapNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Todo se lee como string: los CAE, numeros de comprobante y CUIT no deben
  // perder ceros a la izquierda ni precision. La conversion es explicita.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  textNodeName: '#text',
});

/** Parsea un XML de ARCA aplicando las mismas reglas que `soapCall`. */
export function parseXml(xml: string): SoapNode {
  return parser.parse(xml) as SoapNode;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const DEBUG = process.env.ARCA_DEBUG === 'true' || process.env.ARCA_DEBUG === '1';

export const arcaLog = {
  debug(msg: string, extra?: Record<string, unknown>): void {
    if (DEBUG) console.info(`[arca] ${msg}`, extra ?? '');
  },
  info(msg: string, extra?: Record<string, unknown>): void {
    console.info(`[arca] ${msg}`, extra ?? '');
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    console.warn(`[arca] ${msg}`, extra ?? '');
  },
  error(msg: string, extra?: Record<string, unknown>): void {
    console.error(`[arca] ${msg}`, extra ?? '');
  },
};

// ---------------------------------------------------------------------------
// Construccion de XML
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CARACTERES_INVALIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Escapa el contenido de un tag XML. Imprescindible: la razon social, las
 * descripciones de los items y las observaciones son texto libre cargado por
 * el usuario y pueden traer &, <, >, comillas o caracteres de control.
 */
export function escapeXml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(CARACTERES_INVALIDOS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Arma un tag simple. Devuelve cadena vacia si el valor es null/undefined/'',
 * porque ARCA rechaza los tags opcionales vacios.
 */
export function tag(nombre: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '';
  return `<${nombre}>${escapeXml(valor)}</${nombre}>`;
}

/** Sobre SOAP completo. */
export function buildEnvelope(
  body: string,
  version: SoapVersion = '1.1',
  namespaces: Record<string, string> = {},
): string {
  const envNs =
    version === '1.2'
      ? 'http://www.w3.org/2003/05/soap-envelope'
      : 'http://schemas.xmlsoap.org/soap/envelope/';
  const extra = Object.entries(namespaces)
    .map(([prefijo, uri]) => ` xmlns:${prefijo}="${uri}"`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<soap:Envelope xmlns:soap="${envNs}"${extra}>\n` +
    '  <soap:Header/>\n' +
    '  <soap:Body>\n' +
    `${body}\n` +
    '  </soap:Body>\n' +
    '</soap:Envelope>'
  );
}

/**
 * Oculta el Token y el Sign antes de guardar el XML para auditoria: son
 * credenciales vigentes por 12 horas y no deben quedar en la base.
 */
export function maskAuth(xml: string): string {
  return xml
    .replace(/(<Token>)[\s\S]*?(<\/Token>)/g, '$1***$2')
    .replace(/(<Sign>)[\s\S]*?(<\/Sign>)/g, '$1***$2')
    .replace(/(<token>)[\s\S]*?(<\/token>)/g, '$1***$2')
    .replace(/(<sign>)[\s\S]*?(<\/sign>)/g, '$1***$2')
    .replace(/(<in0>)[\s\S]*?(<\/in0>)/g, '$1***$2');
}

// ---------------------------------------------------------------------------
// Navegacion del XML parseado
// ---------------------------------------------------------------------------

/** Navega el objeto parseado por una ruta de claves. Devuelve undefined si no existe. */
export function pick(nodo: unknown, ...ruta: string[]): unknown {
  let actual: unknown = nodo;
  for (const clave of ruta) {
    if (actual === null || actual === undefined || typeof actual !== 'object') return undefined;
    actual = (actual as Record<string, unknown>)[clave];
  }
  return actual;
}

/** Normaliza a array: fast-xml-parser colapsa los arrays de un solo elemento. */
export function asArray<T = unknown>(valor: unknown): T[] {
  if (valor === null || valor === undefined || valor === '') return [];
  return (Array.isArray(valor) ? valor : [valor]) as T[];
}

export function asString(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    const texto = (valor as Record<string, unknown>)['#text'];
    return texto === undefined ? '' : String(texto).trim();
  }
  return String(valor).trim();
}

export function asNumber(valor: unknown, porDefecto = 0): number {
  const texto = asString(valor);
  if (texto === '') return porDefecto;
  const n = Number(texto);
  return Number.isFinite(n) ? n : porDefecto;
}

export function asBoolSN(valor: unknown): boolean {
  return asString(valor).toUpperCase() === 'S';
}

/** Convierte una fecha yyyymmdd de ARCA a Date (mediodia UTC, para no correr de dia). */
export function parseFechaArca(valor: unknown): Date | null {
  const texto = asString(valor).replace(/-/g, '');
  if (!/^\d{8}$/.test(texto)) return null;
  const anio = Number(texto.slice(0, 4));
  const mes = Number(texto.slice(4, 6));
  const dia = Number(texto.slice(6, 8));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
}

/** Formatea una fecha como yyyymmdd, que es lo que espera ARCA. */
export function formatFechaArca(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${anio}${mes}${dia}`;
}

// ---------------------------------------------------------------------------
// Llamada
// ---------------------------------------------------------------------------

const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function contieneFault(xml: string): boolean {
  return /<(?:\w+:)?Fault[\s>]/i.test(xml);
}

function esErrorDeRed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    err.name === 'TypeError' || // fetch: failed to fetch / ENOTFOUND / ECONNRESET
    err.name === 'FetchError' ||
    /fetch failed|network|socket|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(err.message)
  );
}

/**
 * POST SOAP con timeout, reintentos y parseo.
 * Lanza `ArcaError` (UNAVAILABLE ante red/5xx, o lo que diga el Fault).
 */
export async function soapCall(opts: SoapCallOptions): Promise<SoapResponse> {
  const version = opts.version ?? '1.1';
  const timeoutMs = opts.timeoutMs ?? config.arca.timeoutMs;
  const intentosMax = 1 + (opts.retries ?? 2);
  const label = opts.label ?? opts.action ?? 'SOAP';
  const envelope = buildEnvelope(opts.body, version, opts.namespaces);
  const requestXml = maskAuth(envelope);

  const headers: Record<string, string> =
    version === '1.2'
      ? {
          'Content-Type': `application/soap+xml; charset=utf-8${
            opts.action ? `; action="${opts.action}"` : ''
          }`,
        }
      : {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `"${opts.action ?? ''}"`,
        };
  headers['User-Agent'] = 'galcosto/1.0 (+facturacion electronica)';
  headers.Accept = 'text/xml, application/soap+xml';

  let ultimoError: unknown;

  for (let intento = 1; intento <= intentosMax; intento++) {
    const inicio = Date.now();
    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers,
        body: envelope,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      const durationMs = Date.now() - inicio;
      arcaLog.debug(`${label} -> ${res.status} en ${durationMs}ms`, { url: opts.url });

      // Los SOAP Fault de ASMX viajan con HTTP 500: hay que mirar el cuerpo
      // antes de decidir si conviene reintentar.
      if (contieneFault(raw)) {
        const error = mapSoapFault(raw);
        arcaLog.warn(`${label} devolvio un SOAP Fault: ${error.resumen}`);
        throw error;
      }

      if (!res.ok) {
        const reintentable = res.status >= 500 || res.status === 429;
        const error = ArcaError.noDisponible(
          `ARCA respondio HTTP ${res.status} en ${label}. El servicio puede estar en mantenimiento.`,
          [{ code: res.status, msg: raw.slice(0, 500) }],
        );
        if (reintentable && intento < intentosMax) {
          ultimoError = error;
          await espera(backoff(intento));
          continue;
        }
        throw error;
      }

      if (raw.trim() === '') {
        throw ArcaError.noDisponible(`ARCA devolvio una respuesta vacia en ${label}`);
      }

      return { raw, requestXml, parsed: parseXml(raw), status: res.status, durationMs };
    } catch (err) {
      if (err instanceof ArcaError) throw err;

      if (esErrorDeRed(err) && intento < intentosMax) {
        ultimoError = err;
        const demora = backoff(intento);
        arcaLog.warn(
          `${label} fallo por red (intento ${intento}/${intentosMax}), reintento en ${demora}ms`,
          { motivo: err instanceof Error ? err.message : String(err) },
        );
        await espera(demora);
        continue;
      }

      const esTimeout = err instanceof Error && err.name === 'TimeoutError';
      throw ArcaError.noDisponible(
        esTimeout
          ? `ARCA no respondio en ${timeoutMs}ms (${label}). Reintentá en unos minutos.`
          : `No se pudo conectar con ARCA (${label}): ${
              err instanceof Error ? err.message : String(err)
            }`,
        [],
        err,
      );
    }
  }

  throw ArcaError.noDisponible(
    `No se pudo completar ${label} despues de ${intentosMax} intentos`,
    [],
    ultimoError,
  );
}

/** Backoff exponencial con jitter: 400ms, 800ms, 1600ms... */
function backoff(intento: number): number {
  const base = 400 * 2 ** (intento - 1);
  return Math.round(base + Math.random() * 200);
}
