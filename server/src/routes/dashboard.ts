/**
 * Tablero: metricas del estudio o de una empresa puntual.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { sesionDe } from '../lib/auth.js';
import { dashboardQuerySchema, parsear } from '../lib/validation.js';
import { getDashboard } from '../services/dashboard-service.js';

export async function rutasDashboard(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** GET /api/dashboard?companyId=&periodo=mes */
  app.get('/', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const query = parsear(dashboardQuerySchema, request.query);
    return getDashboard(query, studioId);
  });
}
