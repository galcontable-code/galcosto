/**
 * Rutas de empresas emisoras.
 *
 * Toda operacion pasa por `assertCompanyAccess`: una empresa de otro estudio
 * es indistinguible de una inexistente. Las respuestas NUNCA incluyen
 * `certPemEnc` ni `keyPemEnc`; solo metadatos del certificado.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/multipart';

import { prisma } from '../lib/prisma.js';
import { assertCompanyAccess, sesionDe } from '../lib/auth.js';
import { badRequest, conflict, esErrorPrisma } from '../lib/errors.js';
import { parsearFechaIso, serializarEmpresa } from '../lib/format.js';
import {
  createCompanySchema,
  credentialsSchema,
  idParamsSchema,
  nextNumberQuerySchema,
  parsear,
  updateCompanySchema,
} from '../lib/validation.js';
import { construirCredenciales } from '../services/invoice-service.js';
import { getArcaClient } from '../arca/index.js';
import { encryptSecret, inspectCertificate, validateKeyPair } from '../lib/crypto.js';

export async function rutasCompanies(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** GET /api/companies */
  app.get('/', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const query = request.query as { includeInactive?: string };
    const incluirInactivas = query.includeInactive === 'true' || query.includeInactive === '1';

    const empresas = await prisma.company.findMany({
      where: { studioId, ...(incluirInactivas ? {} : { active: true }) },
      orderBy: [{ active: 'desc' }, { razonSocial: 'asc' }],
    });
    return { items: empresas.map(serializarEmpresa), total: empresas.length };
  });

  /** POST /api/companies */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { studioId, userId } = sesionDe(request);
    const body = parsear(createCompanySchema, request.body);

    try {
      const empresa = await prisma.company.create({
        data: {
          studioId,
          razonSocial: body.razonSocial,
          cuit: body.cuit,
          nombreFantasia: body.nombreFantasia ?? null,
          condicionIva: body.condicionIva,
          domicilio: body.domicilio ?? null,
          localidad: body.localidad ?? null,
          provincia: body.provincia ?? null,
          ingresosBrutos: body.ingresosBrutos ?? null,
          inicioActividades: body.inicioActividades
            ? parsearFechaIso(body.inicioActividades)
            : null,
          logoDataUrl: body.logoDataUrl ?? null,
          environment: body.environment,
          defaultPtoVta: body.defaultPtoVta,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          studioId,
          action: 'EMPRESA_CREADA',
          entity: 'Company',
          entityId: empresa.id,
          detail: JSON.stringify({ razonSocial: empresa.razonSocial, cuit: empresa.cuit }),
          ip: request.ip,
        },
      });

      return reply.status(201).send(serializarEmpresa(empresa));
    } catch (err) {
      if (esErrorPrisma(err, 'P2002')) {
        throw conflict(
          `Ya cargaste una empresa con el CUIT ${body.cuit} en el entorno ${body.environment}`,
        );
      }
      throw err;
    }
  });

  /** GET /api/companies/:id */
  app.get('/:id', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const empresa = await assertCompanyAccess(id, studioId);
    return serializarEmpresa(empresa);
  });

  /** PATCH /api/companies/:id */
  app.patch('/:id', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    await assertCompanyAccess(id, studioId);
    const body = parsear(updateCompanySchema, request.body);

    try {
      const empresa = await prisma.company.update({
        where: { id },
        data: {
          ...(body.razonSocial !== undefined ? { razonSocial: body.razonSocial } : {}),
          ...(body.cuit !== undefined ? { cuit: body.cuit } : {}),
          ...(body.nombreFantasia !== undefined ? { nombreFantasia: body.nombreFantasia } : {}),
          ...(body.condicionIva !== undefined ? { condicionIva: body.condicionIva } : {}),
          ...(body.domicilio !== undefined ? { domicilio: body.domicilio } : {}),
          ...(body.localidad !== undefined ? { localidad: body.localidad } : {}),
          ...(body.provincia !== undefined ? { provincia: body.provincia } : {}),
          ...(body.ingresosBrutos !== undefined ? { ingresosBrutos: body.ingresosBrutos } : {}),
          ...(body.inicioActividades !== undefined
            ? {
                inicioActividades: body.inicioActividades
                  ? parsearFechaIso(body.inicioActividades)
                  : null,
              }
            : {}),
          ...(body.logoDataUrl !== undefined ? { logoDataUrl: body.logoDataUrl } : {}),
          ...(body.environment !== undefined ? { environment: body.environment } : {}),
          ...(body.defaultPtoVta !== undefined ? { defaultPtoVta: body.defaultPtoVta } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          studioId,
          action: 'EMPRESA_ACTUALIZADA',
          entity: 'Company',
          entityId: empresa.id,
          ip: request.ip,
        },
      });

      return serializarEmpresa(empresa);
    } catch (err) {
      if (esErrorPrisma(err, 'P2002')) {
        throw conflict('Ya existe otra empresa con ese CUIT en el mismo entorno');
      }
      throw err;
    }
  });

  /** DELETE /api/companies/:id (baja logica) */
  app.delete('/:id', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    await assertCompanyAccess(id, studioId);

    const empresa = await prisma.company.update({ where: { id }, data: { active: false } });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'EMPRESA_BAJA',
        entity: 'Company',
        entityId: id,
        ip: request.ip,
      },
    });

    return serializarEmpresa(empresa);
  });

  /** POST /api/companies/:id/credentials */
  app.post('/:id/credentials', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    await assertCompanyAccess(id, studioId);

    const { certPem, keyPem } = await leerCredenciales(request);

    // El par certificado/clave tiene que corresponderse: si no, WSAA rechaza
    // el login con un error criptico.
    const parValido: unknown = await validateKeyPair(certPem, keyPem);
    if (!interpretarValidacion(parValido)) {
      throw badRequest(
        'El certificado y la clave privada no se corresponden. Verifica que sean el par que generaste para este CUIT.',
      );
    }

    const info: unknown = await inspectCertificate(certPem);
    const { subject, expiresAt } = leerInfoCertificado(info);

    if (expiresAt && expiresAt.getTime() < Date.now()) {
      throw badRequest(
        `El certificado vencio el ${expiresAt.toISOString().slice(0, 10)}. Genera uno nuevo en el portal de ARCA.`,
      );
    }

    const empresa = await prisma.company.update({
      where: { id },
      data: {
        certPemEnc: encryptSecret(certPem),
        keyPemEnc: encryptSecret(keyPem),
        certSubject: subject,
        certExpiresAt: expiresAt,
        certUploadedAt: new Date(),
      },
    });

    // Al cambiar las credenciales se invalidan los tickets de acceso cacheados.
    await prisma.arcaTicket.deleteMany({ where: { companyId: id } });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'CREDENCIALES_CARGADAS',
        entity: 'Company',
        entityId: id,
        detail: JSON.stringify({ certSubject: subject }),
        ip: request.ip,
      },
    });

    return {
      certSubject: empresa.certSubject,
      certExpiresAt: empresa.certExpiresAt?.toISOString() ?? null,
      certUploadedAt: empresa.certUploadedAt?.toISOString() ?? null,
      company: serializarEmpresa(empresa),
    };
  });

  /** DELETE /api/companies/:id/credentials */
  app.delete('/:id/credentials', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    await assertCompanyAccess(id, studioId);

    const empresa = await prisma.company.update({
      where: { id },
      data: {
        certPemEnc: null,
        keyPemEnc: null,
        certSubject: null,
        certExpiresAt: null,
        certUploadedAt: null,
      },
    });
    await prisma.arcaTicket.deleteMany({ where: { companyId: id } });

    await prisma.auditLog.create({
      data: {
        userId,
        studioId,
        action: 'CREDENCIALES_BORRADAS',
        entity: 'Company',
        entityId: id,
        ip: request.ip,
      },
    });

    return serializarEmpresa(empresa);
  });

  /** POST /api/companies/:id/test-connection */
  app.post('/:id/test-connection', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const empresa = await assertCompanyAccess(id, studioId);

    const client = getArcaClient();
    const creds = construirCredenciales(empresa);
    const environment = empresa.environment === 'PROD' ? 'PROD' : 'HOMO';

    const health = await client.health(environment);
    const ta = await client.authenticate(creds, 'wsfe');

    return {
      ok: health.ok,
      environment,
      health,
      ta: {
        expirationTime: ta.expirationTime.toISOString(),
        generationTime: ta.generationTime.toISOString(),
      },
    };
  });

  /** GET /api/companies/:id/puntos-venta */
  app.get('/:id/puntos-venta', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const empresa = await assertCompanyAccess(id, studioId);

    const puntos = await getArcaClient().getPuntosVenta(construirCredenciales(empresa));
    return { items: puntos, total: puntos.length };
  });

  /** GET /api/companies/:id/next-number?ptoVta=1&cbteTipo=11 */
  app.get('/:id/next-number', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const { ptoVta, cbteTipo } = parsear(nextNumberQuerySchema, request.query);
    const empresa = await assertCompanyAccess(id, studioId);

    const ultimoAutorizado = await getArcaClient().getUltimoAutorizado(
      construirCredenciales(empresa),
      ptoVta,
      cbteTipo,
    );

    return { ultimoAutorizado, proximo: ultimoAutorizado + 1, ptoVta, cbteTipo };
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Acepta el certificado como JSON (`{certPem, keyPem}`) o como multipart. */
async function leerCredenciales(
  request: FastifyRequest,
): Promise<{ certPem: string; keyPem: string }> {
  if (typeof request.isMultipart === 'function' && request.isMultipart()) {
    const campos: Record<string, string> = {};
    for await (const parte of request.parts()) {
      if (parte.type === 'file') {
        const buffer = await parte.toBuffer();
        campos[parte.fieldname] = buffer.toString('utf8');
      } else {
        campos[parte.fieldname] = String(parte.value ?? '');
      }
    }
    return parsear(credentialsSchema, {
      certPem: campos['certPem'] ?? campos['cert'] ?? campos['certificado'] ?? '',
      keyPem: campos['keyPem'] ?? campos['key'] ?? campos['clave'] ?? '',
    });
  }
  return parsear(credentialsSchema, request.body);
}

/**
 * `validateKeyPair` puede devolver un booleano o un objeto con `ok`. Se lee de
 * forma defensiva para no acoplarse a un detalle de la capa de criptografia.
 */
function interpretarValidacion(resultado: unknown): boolean {
  if (typeof resultado === 'boolean') return resultado;
  if (typeof resultado === 'object' && resultado !== null) {
    const r = resultado as Record<string, unknown>;
    if (typeof r['ok'] === 'boolean') return r['ok'];
    if (typeof r['valid'] === 'boolean') return r['valid'];
  }
  // Si no devolvio nada interpretable, se asume que valida lanzando.
  return true;
}

/** Normaliza lo que devuelve `inspectCertificate`. */
function leerInfoCertificado(info: unknown): { subject: string | null; expiresAt: Date | null } {
  if (typeof info !== 'object' || info === null) return { subject: null, expiresAt: null };
  const r = info as Record<string, unknown>;

  const subject = primerTexto(r, ['subject', 'subjectCN', 'commonName', 'cn', 'certSubject']);
  const expiresAt = primeraFecha(r, [
    'notAfter',
    'expiresAt',
    'validTo',
    'certExpiresAt',
    'expirationDate',
    'validoHasta',
  ]);

  return { subject, expiresAt };
}

function primerTexto(fuente: Record<string, unknown>, claves: string[]): string | null {
  for (const clave of claves) {
    const valor = fuente[clave];
    if (typeof valor === 'string' && valor.trim() !== '') return valor;
  }
  return null;
}

function primeraFecha(fuente: Record<string, unknown>, claves: string[]): Date | null {
  for (const clave of claves) {
    const valor = fuente[clave];
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
    if (typeof valor === 'string' || typeof valor === 'number') {
      const fecha = new Date(valor);
      if (!Number.isNaN(fecha.getTime())) return fecha;
    }
  }
  return null;
}
