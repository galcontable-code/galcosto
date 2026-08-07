/**
 * Autenticacion y control de acceso multi-tenant.
 *
 * El tenant raiz es el estudio (`studioId`). TODA consulta a la base tiene que
 * filtrar por el estudio del usuario logueado: nunca se puede leer ni escribir
 * informacion de otro estudio. `assertCompanyAccess` es la puerta por la que
 * pasan todas las rutas que reciben un `companyId` del cliente.
 */

import bcrypt from 'bcryptjs';
import type { Company } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/jwt';

import { prisma } from './prisma.js';
import { forbidden, notFound, unauthorized } from './errors.js';

/** Lo que viaja adentro del JWT y queda en `request.user`. */
export interface SesionUsuario {
  userId: string;
  studioId: string;
  role: string;
  email: string;
  name: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SesionUsuario;
    user: SesionUsuario;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler que exige un JWT valido y completa `request.user`. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const ROUNDS_BCRYPT = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS_BCRYPT);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * preHandler de autenticacion. Se registra como decorador de la instancia raiz
 * en `app.ts` para que este disponible en todas las rutas.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized('Sesion invalida o expirada. Volve a iniciar sesion.');
  }
  const sesion = request.user;
  if (!sesion || typeof sesion.studioId !== 'string' || typeof sesion.userId !== 'string') {
    throw unauthorized('El token no contiene una sesion valida');
  }
}

/** Datos de sesion, ya verificados. Uso interno de las rutas protegidas. */
export function sesionDe(request: FastifyRequest): SesionUsuario {
  const sesion = request.user;
  if (!sesion) throw unauthorized();
  return sesion;
}

/** Exige rol ADMIN. */
export function assertAdmin(request: FastifyRequest): SesionUsuario {
  const sesion = sesionDe(request);
  if (sesion.role !== 'ADMIN') {
    throw forbidden('Esta operacion requiere permisos de administrador');
  }
  return sesion;
}

/**
 * Verifica que la empresa exista y pertenezca al estudio del usuario.
 * Devuelve la empresa completa (incluye los campos cifrados: NO serializarla
 * directamente, usar `serializarEmpresa`).
 */
export async function assertCompanyAccess(
  companyId: string,
  studioId: string,
): Promise<Company> {
  const empresa = await prisma.company.findFirst({ where: { id: companyId, studioId } });
  if (!empresa) {
    // No se distingue "no existe" de "es de otro estudio": no filtramos
    // informacion sobre la existencia de recursos ajenos.
    throw notFound('No se encontro la empresa solicitada');
  }
  return empresa;
}

/** Igual que `assertCompanyAccess` pero exigiendo que este activa. */
export async function assertCompanyActiva(
  companyId: string,
  studioId: string,
): Promise<Company> {
  const empresa = await assertCompanyAccess(companyId, studioId);
  if (!empresa.active) {
    throw forbidden(`La empresa ${empresa.razonSocial} esta dada de baja`);
  }
  return empresa;
}
