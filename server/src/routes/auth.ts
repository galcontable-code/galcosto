/**
 * Rutas de autenticacion: bootstrap del estudio, login y sesion actual.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Studio, User } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, sesionDe, verifyPassword, type SesionUsuario } from '../lib/auth.js';
import { loginSchema, parsear, registerSchema } from '../lib/validation.js';

interface UsuarioSerializado {
  id: string;
  name: string;
  email: string;
  role: string;
  studioId: string;
  active: boolean;
  lastLoginAt: string | null;
}

interface EstudioSerializado {
  id: string;
  name: string;
  cuit: string | null;
  email: string | null;
}

function serializarUsuario(user: User): UsuarioSerializado {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studioId: user.studioId,
    active: user.active,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function serializarEstudio(studio: Studio): EstudioSerializado {
  return { id: studio.id, name: studio.name, cuit: studio.cuit, email: studio.email };
}

function firmarToken(app: FastifyInstance, user: User): string {
  const payload: SesionUsuario = {
    userId: user.id,
    studioId: user.studioId,
    role: user.role,
    email: user.email,
    name: user.name,
  };
  return app.jwt.sign(payload);
}

export async function rutasAuth(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/register
   * Bootstrap: crea el estudio y su primer usuario ADMIN. Publico.
   */
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parsear(registerSchema, request.body);

    const existente = await prisma.user.findUnique({ where: { email: body.email } });
    if (existente) {
      throw conflict('Ya existe un usuario registrado con ese email');
    }

    const passwordHash = await hashPassword(body.password);

    const { studio, user } = await prisma.$transaction(async (tx) => {
      const nuevoEstudio = await tx.studio.create({
        data: { name: body.studioName, email: body.email },
      });
      const nuevoUsuario = await tx.user.create({
        data: {
          studioId: nuevoEstudio.id,
          email: body.email,
          name: body.name,
          passwordHash,
          role: 'ADMIN',
        },
      });
      await tx.auditLog.create({
        data: {
          userId: nuevoUsuario.id,
          studioId: nuevoEstudio.id,
          action: 'ESTUDIO_CREADO',
          entity: 'Studio',
          entityId: nuevoEstudio.id,
          ip: request.ip,
        },
      });
      return { studio: nuevoEstudio, user: nuevoUsuario };
    });

    return reply.status(201).send({
      token: firmarToken(app, user),
      user: serializarUsuario(user),
      studio: serializarEstudio(studio),
    });
  });

  /** POST /api/auth/login */
  app.post('/login', async (request: FastifyRequest) => {
    const body = parsear(loginSchema, request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { studio: true },
    });

    // Mismo mensaje para usuario inexistente y contrasena incorrecta: no se
    // filtra que emails existen.
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('El email o la contrasena no son correctos');
    }
    if (!user.active) {
      throw unauthorized('El usuario esta deshabilitado. Contacta al administrador del estudio.');
    }

    const actualizado = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        studioId: user.studioId,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        ip: request.ip,
      },
    });

    return {
      token: firmarToken(app, actualizado),
      user: serializarUsuario(actualizado),
      studio: serializarEstudio(user.studio),
    };
  });

  /** GET /api/auth/me */
  app.get('/me', { preHandler: app.authenticate }, async (request: FastifyRequest) => {
    const sesion = sesionDe(request);
    const user = await prisma.user.findFirst({
      where: { id: sesion.userId, studioId: sesion.studioId },
      include: { studio: true },
    });
    if (!user) throw unauthorized('La sesion ya no es valida');

    return { user: serializarUsuario(user), studio: serializarEstudio(user.studio) };
  });
}
