/**
 * Salud del servicio y estado de los servidores de ARCA. Ambos endpoints son
 * publicos: los usa el frontend antes del login y el monitoreo externo.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { arcaStatusQuerySchema, parsear } from '../lib/validation.js';
import { getArcaClient } from '../arca/index.js';

/** Version de la app. Se mantiene sincronizada con server/package.json. */
export const APP_VERSION = '1.0.0';

const arrancadoEn = Date.now();

export async function rutasHealth(app: FastifyInstance): Promise<void> {
  /** GET /api/health */
  app.get('/health', async () => {
    let baseOk = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      baseOk = false;
    }

    return {
      ok: baseOk,
      version: APP_VERSION,
      demoMode: config.demoMode,
      uptime: Math.round((Date.now() - arrancadoEn) / 1000),
      env: config.env,
      db: baseOk ? 'ok' : 'error',
    };
  });

  /** GET /api/arca/status?environment=HOMO */
  app.get('/arca/status', async (request: FastifyRequest) => {
    const { environment } = parsear(arcaStatusQuerySchema, request.query);

    try {
      const health = await getArcaClient().health(environment);
      return {
        ok: health.ok,
        environment,
        demoMode: config.demoMode,
        appServer: health.appServer,
        dbServer: health.dbServer,
        authServer: health.authServer,
        mensaje: health.ok
          ? 'Los servicios de ARCA responden con normalidad'
          : 'Alguno de los servicios de ARCA no esta respondiendo',
      };
    } catch (err) {
      // El estado nunca devuelve 5xx: informa que no se pudo consultar.
      return {
        ok: false,
        environment,
        demoMode: config.demoMode,
        appServer: null,
        dbServer: null,
        authServer: null,
        mensaje: `No se pudo consultar el estado de ARCA: ${
          err instanceof Error ? err.message : 'error desconocido'
        }`,
      };
    }
  });
}
