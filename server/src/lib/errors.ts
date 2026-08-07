/**
 * Errores de aplicacion.
 *
 * Todo error que sale por la API tiene la forma que define docs/API.md:
 *
 *   { "error": { "code": "...", "message": "...", "details": [{ code, msg }] } }
 *
 * `AppError` es la unica excepcion que el resto del backend deberia lanzar a
 * proposito. El manejador global de `app.ts` la traduce a esa forma; cualquier
 * otra cosa cae en INTERNAL 500 y se loguea.
 */

/** Detalle puntual de un error, con el mismo shape que devuelve ARCA. */
export interface DetalleError {
  code: number;
  msg: string;
}

/** Codigos de error del contrato (docs/API.md). */
export type CodigoError =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ARCA_REJECTED'
  | 'ARCA_UNAVAILABLE'
  | 'ARCA_CONFIG_ERROR'
  | 'INTERNAL';

/** Cuerpo serializado de un error de la API. */
export interface CuerpoError {
  error: {
    code: string;
    message: string;
    details: DetalleError[];
  };
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: DetalleError[];

  constructor(
    code: CodigoError | string,
    message: string,
    httpStatus: number,
    details: DetalleError[] = [],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  toBody(): CuerpoError {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function badRequest(message: string, details: DetalleError[] = []): AppError {
  return new AppError('VALIDATION_ERROR', message, 400, details);
}

export function unauthorized(message = 'Credenciales invalidas o sesion expirada'): AppError {
  return new AppError('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'No tenes permiso para acceder a este recurso'): AppError {
  return new AppError('FORBIDDEN', message, 403);
}

export function notFound(message = 'No se encontro el recurso solicitado'): AppError {
  return new AppError('NOT_FOUND', message, 404);
}

export function conflict(message: string, details: DetalleError[] = []): AppError {
  return new AppError('CONFLICT', message, 409, details);
}

/** ARCA rechazo el comprobante (resultado "R"). */
export function arcaRejected(message: string, details: DetalleError[] = []): AppError {
  return new AppError('ARCA_REJECTED', message, 422, details);
}

/** Los servidores de ARCA no responden o estan caidos. */
export function arcaUnavailable(
  message = 'Los servidores de ARCA no estan disponibles en este momento. Intentalo de nuevo en unos minutos.',
  details: DetalleError[] = [],
): AppError {
  return new AppError('ARCA_UNAVAILABLE', message, 503, details);
}

/** Falta configuracion (certificado / clave privada) para poder emitir. */
export function arcaConfigError(message: string, details: DetalleError[] = []): AppError {
  return new AppError('ARCA_CONFIG_ERROR', message, 400, details);
}

export function internal(message = 'Ocurrio un error inesperado en el servidor'): AppError {
  return new AppError('INTERNAL', message, 500);
}

/* -------------------------------------------------------------------------- */
/* Reconocimiento de errores ajenos                                            */
/* -------------------------------------------------------------------------- */

/**
 * Forma minima de un `ArcaError` (capa server/src/arca). Se detecta por
 * estructura y no por `instanceof` para no acoplar el manejador global al
 * modulo de ARCA (que se construye en paralelo y podria no estar cargado).
 */
export interface ErrorTipoArca {
  code: string;
  message: string;
  httpStatus: number;
  details: DetalleError[];
}

export function esErrorTipoArca(err: unknown): err is ErrorTipoArca {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return (
    typeof e['code'] === 'string' &&
    typeof e['message'] === 'string' &&
    typeof e['httpStatus'] === 'number'
  );
}

/** Normaliza el `details` de cualquier error que se le parezca a un ArcaError. */
export function detallesDe(err: unknown): DetalleError[] {
  if (typeof err !== 'object' || err === null) return [];
  const raw = (err as Record<string, unknown>)['details'];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      code: typeof d['code'] === 'number' ? d['code'] : Number(d['code'] ?? 0) || 0,
      msg: String(d['msg'] ?? d['message'] ?? ''),
    }));
}

/** Error conocido de Prisma (P2002 unique, P2025 not found, etc). */
export interface ErrorPrisma {
  code: string;
  meta?: Record<string, unknown>;
}

export function esErrorPrisma(err: unknown, code?: string): err is ErrorPrisma {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  if (typeof e['code'] !== 'string' || !e['code'].startsWith('P')) return false;
  return code === undefined || e['code'] === code;
}
