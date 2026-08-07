/**
 * Consulta al padron de ARCA (ws_sr_padron_a5).
 *
 * Necesita las credenciales de alguna empresa del estudio para autenticarse:
 * si no se manda `companyId` se usa la primera empresa activa.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { assertCompanyAccess, sesionDe } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { padronParamsSchema, padronQuerySchema, parsear } from '../lib/validation.js';
import { construirCredenciales } from '../services/invoice-service.js';
import { getArcaClient } from '../arca/index.js';

export async function rutasPadron(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** GET /api/padron/:cuit?companyId= */
  app.get('/:cuit', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { cuit } = parsear(padronParamsSchema, request.params);
    const { companyId } = parsear(padronQuerySchema, request.query);

    const empresa = companyId
      ? await assertCompanyAccess(companyId, studioId)
      : await prisma.company.findFirst({
          where: { studioId, active: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!empresa) {
      throw badRequest(
        'Para consultar el padron hace falta al menos una empresa cargada en el estudio',
      );
    }

    const datos = await getArcaClient().consultarPadron(construirCredenciales(empresa), cuit);
    if (!datos) {
      throw notFound(`No se encontro ningun contribuyente con el CUIT ${cuit} en el padron de ARCA`);
    }

    return datos;
  });
}
