/**
 * Errores de la integracion con ARCA.
 *
 * Todo lo que sale de esta capa hacia el resto de la app viaja como
 * `ArcaError`, con un `code` estable que el handler de errores de Fastify
 * traduce al formato de la API:
 *
 *   { error: { code, message, details: [{ code, msg }] } }
 *
 * Los mensajes estan en espanol porque se muestran tal cual al usuario.
 */

import { XMLParser } from 'fast-xml-parser';

export type ArcaErrorCode =
  /** ARCA proceso el pedido y lo rechazo por reglas de negocio. */
  | 'ARCA_REJECTED'
  /** No se pudo hablar con ARCA (red, timeout, 5xx, mantenimiento). */
  | 'ARCA_UNAVAILABLE'
  /** Problema de autenticacion: WSAA rechazo el certificado o el TA. */
  | 'ARCA_AUTH_ERROR'
  /** Falta configuracion nuestra: certificado sin cargar, CUIT invalido, etc. */
  | 'ARCA_CONFIG_ERROR';

export interface ArcaErrorDetail {
  code: number;
  msg: string;
}

/**
 * Status HTTP por defecto de cada codigo (ver docs/API.md).
 * ARCA_AUTH_ERROR usa 502 y no 401 a proposito: el 401 es para la sesion del
 * usuario en nuestra app, no para la autenticacion contra ARCA.
 */
const HTTP_POR_CODIGO: Record<ArcaErrorCode, number> = {
  ARCA_REJECTED: 422,
  ARCA_UNAVAILABLE: 503,
  ARCA_AUTH_ERROR: 502,
  ARCA_CONFIG_ERROR: 400,
};

export class ArcaError extends Error {
  readonly code: ArcaErrorCode;
  readonly details: ArcaErrorDetail[];
  readonly httpStatus: number;

  constructor(
    code: ArcaErrorCode,
    message: string,
    details: ArcaErrorDetail[] = [],
    httpStatus?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ArcaError';
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus ?? HTTP_POR_CODIGO[code];
    // Necesario para que `instanceof` funcione al compilar a ES2022 con
    // clases nativas heredando de Error.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Forma serializable, lista para responder desde la API. */
  toJSON(): { code: ArcaErrorCode; message: string; details: ArcaErrorDetail[] } {
    return { code: this.code, message: this.message, details: this.details };
  }

  /** Resumen de una sola linea para logs. */
  get resumen(): string {
    const detalle = this.details.map((d) => `${d.code}: ${d.msg}`).join(' | ');
    return detalle ? `${this.message} (${detalle})` : this.message;
  }

  static rechazado(message: string, details: ArcaErrorDetail[] = []): ArcaError {
    return new ArcaError('ARCA_REJECTED', message, details);
  }

  static noDisponible(
    message: string,
    details: ArcaErrorDetail[] = [],
    cause?: unknown,
  ): ArcaError {
    return new ArcaError('ARCA_UNAVAILABLE', message, details, undefined, { cause });
  }

  static autenticacion(message: string, details: ArcaErrorDetail[] = []): ArcaError {
    return new ArcaError('ARCA_AUTH_ERROR', message, details);
  }

  static configuracion(message: string, details: ArcaErrorDetail[] = []): ArcaError {
    return new ArcaError('ARCA_CONFIG_ERROR', message, details);
  }
}

export function esArcaError(err: unknown): err is ArcaError {
  return err instanceof ArcaError;
}

const faultParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

/** Busca recursivamente la primera clave con ese nombre dentro del objeto parseado. */
function buscarClave(nodo: unknown, clave: string): unknown {
  if (nodo === null || typeof nodo !== 'object') return undefined;
  if (Array.isArray(nodo)) {
    for (const item of nodo) {
      const encontrado = buscarClave(item, clave);
      if (encontrado !== undefined) return encontrado;
    }
    return undefined;
  }
  const obj = nodo as Record<string, unknown>;
  if (clave in obj) return obj[clave];
  for (const valor of Object.values(obj)) {
    const encontrado = buscarClave(valor, clave);
    if (encontrado !== undefined) return encontrado;
  }
  return undefined;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    if ('#text' in obj) return texto(obj['#text']);
    // SOAP 1.2: <Reason><Text xml:lang="es">...</Text></Reason>
    if ('Text' in obj) return texto(obj['Text']);
    if ('Value' in obj) return texto(obj['Value']);
  }
  return '';
}

/**
 * Traduce un SOAP Fault (1.1 o 1.2) a un `ArcaError` con mensaje util.
 * Nunca lanza: si el XML es ilegible devuelve un error generico.
 */
export function mapSoapFault(xml: string): ArcaError {
  let faultCode = '';
  let faultString = '';

  try {
    const parsed = faultParser.parse(xml) as unknown;
    const fault = buscarClave(parsed, 'Fault');
    if (fault !== undefined) {
      faultCode = texto(buscarClave(fault, 'faultcode')) || texto(buscarClave(fault, 'Code'));
      faultString =
        texto(buscarClave(fault, 'faultstring')) || texto(buscarClave(fault, 'Reason'));
      if (!faultString) faultString = texto(buscarClave(fault, 'detail'));
    }
  } catch {
    // Se cae al camino por expresiones regulares de abajo.
  }

  if (!faultString) {
    const m = /<(?:\w+:)?faultstring[^>]*>([\s\S]*?)<\/(?:\w+:)?faultstring>/i.exec(xml);
    if (m?.[1]) faultString = m[1].trim();
  }
  if (!faultCode) {
    const m = /<(?:\w+:)?faultcode[^>]*>([\s\S]*?)<\/(?:\w+:)?faultcode>/i.exec(xml);
    if (m?.[1]) faultCode = m[1].trim();
  }

  const mensajeArca = faultString || 'ARCA devolvio un error sin descripcion';
  const normalizado = `${faultCode} ${mensajeArca}`.toLowerCase();
  const numero = Number(/(\d{3,6})/.exec(faultCode ?? '')?.[1] ?? 0);
  const details: ArcaErrorDetail[] = [
    { code: Number.isFinite(numero) ? numero : 0, msg: mensajeArca },
  ];

  // Caso clasico de WSAA: ya hay un TA vigente para ese servicio.
  if (normalizado.includes('ya posee un ta') || normalizado.includes('alreadyauthenticated')) {
    return new ArcaError(
      'ARCA_AUTH_ERROR',
      'ARCA informa que ya existe un ticket de acceso vigente para este CUIT y servicio. ' +
        'Se reutiliza el ticket en cache; si el problema persiste, esperá unos minutos antes de reintentar.',
      details,
    );
  }

  if (
    normalizado.includes('certificado') ||
    normalizado.includes('certificate') ||
    normalizado.includes('computador no autorizado') ||
    normalizado.includes('no autorizado a usar el servicio') ||
    normalizado.includes('cee no autorizado') ||
    normalizado.includes('firma') ||
    normalizado.includes('cms')
  ) {
    return new ArcaError(
      'ARCA_AUTH_ERROR',
      `ARCA rechazo las credenciales: ${mensajeArca}. Revisá que el certificado sea del ambiente ` +
        'correcto (homologacion o produccion) y que tenga asociado el servicio y el CUIT de la empresa.',
      details,
    );
  }

  if (
    normalizado.includes('token') ||
    normalizado.includes('sign') ||
    normalizado.includes('autentic')
  ) {
    return new ArcaError(
      'ARCA_AUTH_ERROR',
      `ARCA rechazo el ticket de acceso: ${mensajeArca}. Se va a pedir uno nuevo en el proximo intento.`,
      details,
    );
  }

  // Un Fault generico de WSFEv1 casi siempre es un problema del lado de ARCA:
  // los rechazos de negocio vienen en el array Errors, no como Fault.
  return new ArcaError(
    'ARCA_UNAVAILABLE',
    `ARCA devolvio un error de servicio: ${mensajeArca}`,
    details,
  );
}
