/**
 * Construccion de la aplicacion Fastify.
 *
 * Todo lo que sale por HTTP pasa por el manejador de errores global, que
 * traduce cualquier excepcion al formato unico de docs/API.md:
 *
 *   { "error": { "code", "message", "details": [{ code, msg }] } }
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';

import { config } from './config.js';
import {
  AppError,
  detallesDe,
  esErrorPrisma,
  esErrorTipoArca,
  type CuerpoError,
  type DetalleError,
} from './lib/errors.js';
import { authenticate } from './lib/auth.js';
import { rutasAuth } from './routes/auth.js';
import { rutasCatalogs } from './routes/catalogs.js';
import { rutasCompanies } from './routes/companies.js';
import { rutasCustomers } from './routes/customers.js';
import { rutasDashboard } from './routes/dashboard.js';
import { rutasHealth } from './routes/health.js';
import { rutasInvoices } from './routes/invoices.js';
import { rutasPadron } from './routes/padron.js';
import { rutasProducts } from './routes/products.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Carpeta con el frontend compilado (`npm run build --workspace web`). */
export const DIRECTORIO_WEB = path.resolve(__dirname, '../../web/dist');

/** 8 MB: alcanza para un logo en data URL y para certificados PEM. */
const LIMITE_BODY = 8 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* CORS                                                                        */
/* -------------------------------------------------------------------------- */

const RE_LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function origenPermitido(origen: string): boolean {
  if (origen === config.webOrigin) return true;
  return RE_LOCALHOST.test(origen);
}

/* -------------------------------------------------------------------------- */
/* Traduccion de errores                                                       */
/* -------------------------------------------------------------------------- */

function cuerpoError(code: string, message: string, details: DetalleError[] = []): CuerpoError {
  return { error: { code, message, details } };
}

/** Un ZodError se convierte en VALIDATION_ERROR con un detalle por campo. */
function desdeZod(error: ZodError): { body: CuerpoError; status: number } {
  const details: DetalleError[] = error.issues.map((issue, indice) => ({
    code: indice + 1,
    msg: issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  }));

  const primero = details[0]?.msg ?? 'Los datos enviados no son validos';
  return {
    status: 400,
    body: cuerpoError(
      'VALIDATION_ERROR',
      details.length > 1
        ? `${primero} (y ${details.length - 1} problema(s) mas)`
        : primero,
      details,
    ),
  };
}

/** Mensajes en espanol para los errores conocidos de Prisma. */
function desdePrisma(code: string): { body: CuerpoError; status: number } | null {
  switch (code) {
    case 'P2002':
      return {
        status: 409,
        body: cuerpoError('CONFLICT', 'Ya existe un registro con esos datos unicos'),
      };
    case 'P2025':
      return {
        status: 404,
        body: cuerpoError('NOT_FOUND', 'No se encontro el recurso solicitado'),
      };
    case 'P2003':
      return {
        status: 409,
        body: cuerpoError(
          'CONFLICT',
          'No se puede completar la operacion porque hay registros relacionados',
        ),
      };
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* App                                                                         */
/* -------------------------------------------------------------------------- */

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? (config.isProduction ? 'info' : 'debug'),
      // Nunca loguear certificados, claves ni tokens.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'body.password',
          'body.certPem',
          'body.keyPem',
        ],
        censor: '[oculto]',
      },
      serializers: {
        req(request) {
          return { method: request.method, url: request.url, ip: request.ip };
        },
      },
    },
    bodyLimit: LIMITE_BODY,
    trustProxy: true,
    disableRequestLogging: false,
    ajv: { customOptions: { allErrors: true } },
  });

  /* --------------------------------- Plugins ------------------------------ */

  await app.register(fastifyCors, {
    origin(origen, cb) {
      // Peticiones sin Origin (curl, health checks, same-origin) se permiten.
      if (!origen) {
        cb(null, true);
        return;
      }
      if (origenPermitido(origen)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Content-Disposition'],
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: LIMITE_BODY, files: 4 },
  });

  app.decorate('authenticate', authenticate);

  /* ------------------------------ Manejo de errores ----------------------- */

  app.setErrorHandler((error, request, reply) => {
    const err: unknown = error;

    if (err instanceof ZodError) {
      const { body, status } = desdeZod(err);
      request.log.info({ issues: err.issues }, 'Request invalido');
      return reply.status(status).send(body);
    }

    if (err instanceof AppError) {
      if (err.httpStatus >= 500) {
        request.log.error({ err }, err.message);
      } else {
        request.log.info({ code: err.code, details: err.details }, err.message);
      }
      return reply.status(err.httpStatus).send(err.toBody());
    }

    // ArcaError (capa server/src/arca): trae su propio code y httpStatus.
    if (esErrorTipoArca(err)) {
      const status = err.httpStatus >= 400 && err.httpStatus < 600 ? err.httpStatus : 502;
      request.log.warn({ code: err.code, details: err.details }, err.message);
      return reply
        .status(status)
        .send(cuerpoError(err.code, err.message, detallesDe(err)));
    }

    if (esErrorPrisma(err)) {
      const traducido = desdePrisma(err.code);
      if (traducido) {
        request.log.warn({ code: err.code, meta: err.meta }, 'Error de base de datos');
        return reply.status(traducido.status).send(traducido.body);
      }
    }

    // Errores propios de Fastify (JSON mal formado, media type, etc).
    // Fastify tipa el parametro como unknown, asi que lo estrechamos a la
    // forma que nos interesa antes de leerlo.
    const fastifyErr = err as { statusCode?: unknown; message?: unknown };
    const status = typeof fastifyErr.statusCode === 'number' ? fastifyErr.statusCode : 500;
    if (status >= 400 && status < 500) {
      request.log.info({ err }, 'Request rechazado');
      const code =
        status === 401
          ? 'UNAUTHORIZED'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : status === 409
                ? 'CONFLICT'
                : 'VALIDATION_ERROR';
      const mensaje =
        typeof fastifyErr.message === 'string' ? fastifyErr.message : 'Request invalido';
      return reply.status(status).send(cuerpoError(code, mensaje));
    }

    request.log.error({ err: error }, 'Error no controlado');
    return reply
      .status(500)
      .send(
        cuerpoError(
          'INTERNAL',
          'Ocurrio un error inesperado en el servidor. Volve a intentar en unos instantes.',
        ),
      );
  });

  /* --------------------------------- Rutas -------------------------------- */

  await app.register(rutasHealth, { prefix: '/api' });
  await app.register(rutasCatalogs, { prefix: '/api' });
  await app.register(rutasAuth, { prefix: '/api/auth' });
  await app.register(rutasCompanies, { prefix: '/api/companies' });
  await app.register(rutasCustomers, { prefix: '/api/customers' });
  await app.register(rutasProducts, { prefix: '/api/products' });
  await app.register(rutasInvoices, { prefix: '/api/invoices' });
  await app.register(rutasDashboard, { prefix: '/api/dashboard' });
  await app.register(rutasPadron, { prefix: '/api/padron' });

  /* ------------------------- Frontend compilado (SPA) --------------------- */

  const hayWeb = existsSync(path.join(DIRECTORIO_WEB, 'index.html'));
  if (hayWeb) {
    await app.register(fastifyStatic, {
      root: DIRECTORIO_WEB,
      prefix: '/',
      index: ['index.html'],
      wildcard: false,
    });
    app.log.info({ dir: DIRECTORIO_WEB }, 'Sirviendo el frontend compilado');
  } else if (config.isProduction) {
    app.log.warn(
      { dir: DIRECTORIO_WEB },
      'No se encontro el frontend compilado. Corre "npm run build --workspace web".',
    );
  }

  /* ------------------------------- 404 / fallback ------------------------- */

  app.setNotFoundHandler((request, reply) => {
    // La API siempre responde JSON.
    if (request.url.startsWith('/api')) {
      return reply
        .status(404)
        .send(
          cuerpoError('NOT_FOUND', `No existe el endpoint ${request.method} ${request.url}`),
        );
    }

    // Fallback de la SPA: cualquier ruta del frontend devuelve index.html.
    if (hayWeb && request.method === 'GET') {
      return reply.type('text/html').sendFile('index.html');
    }

    return reply.status(404).send(cuerpoError('NOT_FOUND', 'Recurso no encontrado'));
  });

  return app;
}
