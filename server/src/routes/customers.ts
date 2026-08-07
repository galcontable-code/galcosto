/**
 * Rutas de clientes (receptores de los comprobantes).
 *
 * Los clientes cuelgan del estudio. `companyId` es opcional: si esta en null
 * el cliente lo comparten todas las empresas del estudio.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { assertCompanyAccess, sesionDe } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import {
  createCustomerSchema,
  idParamsSchema,
  listCustomersQuerySchema,
  parsear,
  updateCustomerSchema,
} from '../lib/validation.js';
import { serializarCliente } from '../services/invoice-service.js';

const limpiarEmail = (valor: string | null | undefined): string | null => {
  const texto = (valor ?? '').trim();
  return texto === '' ? null : texto;
};

export async function rutasCustomers(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** GET /api/customers?search=&companyId= */
  app.get('/', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const query = parsear(listCustomersQuerySchema, request.query);

    const where: Prisma.CustomerWhereInput = { studioId };
    if (!query.includeInactive) where.active = true;

    if (query.companyId) {
      await assertCompanyAccess(query.companyId, studioId);
      // Los clientes sin empresa son compartidos por todo el estudio.
      where.OR = [{ companyId: query.companyId }, { companyId: null }];
    }

    if (query.search) {
      const termino = query.search;
      const documento = termino.replace(/\D/g, '');
      const filtroBusqueda: Prisma.CustomerWhereInput[] = [
        { razonSocial: { contains: termino } },
        { email: { contains: termino } },
      ];
      if (documento) filtroBusqueda.push({ docNro: { contains: documento } });
      where.AND = [{ OR: filtroBusqueda }];
    }

    const clientes = await prisma.customer.findMany({
      where,
      orderBy: [{ razonSocial: 'asc' }],
      take: 500,
    });

    return { items: clientes.map(serializarCliente), total: clientes.length };
  });

  /** POST /api/customers */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { studioId, userId } = sesionDe(request);
    const body = parsear(createCustomerSchema, request.body);

    if (body.companyId) await assertCompanyAccess(body.companyId, studioId);

    const cliente = await prisma.customer.create({
      data: {
        studioId,
        companyId: body.companyId ?? null,
        razonSocial: body.razonSocial,
        docTipo: body.docTipo,
        docNro: body.docTipo === 99 ? '0' : body.docNro.replace(/\D/g, '') || '0',
        condicionIvaReceptorId: body.condicionIvaReceptorId,
        email: limpiarEmail(body.email),
        telefono: body.telefono ?? null,
        domicilio: body.domicilio ?? null,
        localidad: body.localidad ?? null,
        provincia: body.provincia ?? null,
        notas: body.notas ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'CLIENTE_CREADO',
        entity: 'Customer',
        entityId: cliente.id,
        ip: request.ip,
      },
    });

    return reply.status(201).send(serializarCliente(cliente));
  });

  /** GET /api/customers/:id */
  app.get('/:id', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const cliente = await prisma.customer.findFirst({ where: { id, studioId } });
    if (!cliente) throw notFound('No se encontro el cliente solicitado');
    return serializarCliente(cliente);
  });

  /** PATCH /api/customers/:id */
  app.patch('/:id', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const existente = await prisma.customer.findFirst({ where: { id, studioId } });
    if (!existente) throw notFound('No se encontro el cliente solicitado');

    const body = parsear(updateCustomerSchema, request.body);
    if (body.companyId) await assertCompanyAccess(body.companyId, studioId);

    const docTipo = body.docTipo ?? existente.docTipo;
    const docNro = body.docNro ?? existente.docNro;

    const cliente = await prisma.customer.update({
      where: { id },
      data: {
        ...(body.razonSocial !== undefined ? { razonSocial: body.razonSocial } : {}),
        ...(body.docTipo !== undefined || body.docNro !== undefined
          ? { docTipo, docNro: docTipo === 99 ? '0' : docNro.replace(/\D/g, '') || '0' }
          : {}),
        ...(body.condicionIvaReceptorId !== undefined
          ? { condicionIvaReceptorId: body.condicionIvaReceptorId }
          : {}),
        ...(body.email !== undefined ? { email: limpiarEmail(body.email) } : {}),
        ...(body.telefono !== undefined ? { telefono: body.telefono } : {}),
        ...(body.domicilio !== undefined ? { domicilio: body.domicilio } : {}),
        ...(body.localidad !== undefined ? { localidad: body.localidad } : {}),
        ...(body.provincia !== undefined ? { provincia: body.provincia } : {}),
        ...(body.notas !== undefined ? { notas: body.notas } : {}),
        ...(body.companyId !== undefined ? { companyId: body.companyId } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'CLIENTE_ACTUALIZADO',
        entity: 'Customer',
        entityId: id,
        ip: request.ip,
      },
    });

    return serializarCliente(cliente);
  });

  /** DELETE /api/customers/:id (baja logica) */
  app.delete('/:id', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const existente = await prisma.customer.findFirst({ where: { id, studioId } });
    if (!existente) throw notFound('No se encontro el cliente solicitado');

    const cliente = await prisma.customer.update({ where: { id }, data: { active: false } });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'CLIENTE_BAJA',
        entity: 'Customer',
        entityId: id,
        ip: request.ip,
      },
    });

    return serializarCliente(cliente);
  });
}
