/**
 * Rutas de productos y servicios reutilizables.
 * Cuelgan siempre de una empresa, que a su vez cuelga del estudio.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, Product } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { assertCompanyAccess, sesionDe } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { alicuotaIva } from '../domain/catalogs.js';
import {
  createProductSchema,
  idParamsSchema,
  listProductsQuerySchema,
  parsear,
  updateProductSchema,
} from '../lib/validation.js';

interface ProductoSerializado {
  id: string;
  companyId: string;
  codigo: string | null;
  descripcion: string;
  unidad: string;
  precioUnitario: number;
  ivaId: number;
  alicuota: number;
  precioConIva: boolean;
  /** Precio final con IVA incluido, util para mostrar en la grilla. */
  precioFinal: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function serializarProducto(producto: Product): ProductoSerializado {
  const alicuota = alicuotaIva(producto.ivaId);
  const precioFinal = producto.precioConIva
    ? producto.precioUnitario
    : Math.round(producto.precioUnitario * (1 + alicuota / 100) * 100) / 100;

  return {
    id: producto.id,
    companyId: producto.companyId,
    codigo: producto.codigo,
    descripcion: producto.descripcion,
    unidad: producto.unidad,
    precioUnitario: producto.precioUnitario,
    ivaId: producto.ivaId,
    alicuota,
    precioConIva: producto.precioConIva,
    precioFinal,
    active: producto.active,
    createdAt: producto.createdAt.toISOString(),
    updatedAt: producto.updatedAt.toISOString(),
  };
}

/** Busca un producto verificando que su empresa sea del estudio. */
async function buscarProducto(id: string, studioId: string): Promise<Product> {
  const producto = await prisma.product.findFirst({
    where: { id, company: { studioId } },
  });
  if (!producto) throw notFound('No se encontro el producto solicitado');
  return producto;
}

export async function rutasProducts(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** GET /api/products?companyId=&search= */
  app.get('/', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const query = parsear(listProductsQuerySchema, request.query);

    const where: Prisma.ProductWhereInput = { company: { studioId } };
    if (!query.includeInactive) where.active = true;
    if (query.companyId) {
      await assertCompanyAccess(query.companyId, studioId);
      where.companyId = query.companyId;
    }
    if (query.search) {
      where.OR = [
        { descripcion: { contains: query.search } },
        { codigo: { contains: query.search } },
      ];
    }

    const productos = await prisma.product.findMany({
      where,
      orderBy: [{ descripcion: 'asc' }],
      take: 500,
    });

    return { items: productos.map(serializarProducto), total: productos.length };
  });

  /** GET /api/products/:id */
  app.get('/:id', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    return serializarProducto(await buscarProducto(id, studioId));
  });

  /** POST /api/products */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { studioId, userId } = sesionDe(request);
    const body = parsear(createProductSchema, request.body);
    await assertCompanyAccess(body.companyId, studioId);

    const producto = await prisma.product.create({
      data: {
        companyId: body.companyId,
        codigo: body.codigo ?? null,
        descripcion: body.descripcion,
        unidad: body.unidad,
        precioUnitario: body.precioUnitario,
        ivaId: body.ivaId,
        precioConIva: body.precioConIva,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'PRODUCTO_CREADO',
        entity: 'Product',
        entityId: producto.id,
        ip: request.ip,
      },
    });

    return reply.status(201).send(serializarProducto(producto));
  });

  /** PATCH /api/products/:id */
  app.patch('/:id', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    await buscarProducto(id, studioId);
    const body = parsear(updateProductSchema, request.body);

    const producto = await prisma.product.update({
      where: { id },
      data: {
        ...(body.codigo !== undefined ? { codigo: body.codigo } : {}),
        ...(body.descripcion !== undefined ? { descripcion: body.descripcion } : {}),
        ...(body.unidad !== undefined ? { unidad: body.unidad } : {}),
        ...(body.precioUnitario !== undefined ? { precioUnitario: body.precioUnitario } : {}),
        ...(body.ivaId !== undefined ? { ivaId: body.ivaId } : {}),
        ...(body.precioConIva !== undefined ? { precioConIva: body.precioConIva } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'PRODUCTO_ACTUALIZADO',
        entity: 'Product',
        entityId: id,
        ip: request.ip,
      },
    });

    return serializarProducto(producto);
  });

  /** DELETE /api/products/:id (baja logica) */
  app.delete('/:id', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    await buscarProducto(id, studioId);

    const producto = await prisma.product.update({ where: { id }, data: { active: false } });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'PRODUCTO_BAJA',
        entity: 'Product',
        entityId: id,
        ip: request.ip,
      },
    });

    return serializarProducto(producto);
  });
}
