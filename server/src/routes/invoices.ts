/**
 * Rutas de comprobantes. Toda la logica pesada vive en
 * `services/invoice-service.ts`; aca solo se valida el request, se resuelve la
 * sesion y se delega.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { sesionDe } from '../lib/auth.js';
import {
  creditNoteSchema,
  idParamsSchema,
  invoiceInputSchema,
  listInvoicesQuerySchema,
  parsear,
} from '../lib/validation.js';
import {
  createCreditNote,
  emitInvoice,
  getArcaLog,
  getInvoice,
  listInvoices,
  previewInvoice,
  retryInvoice,
} from '../services/invoice-service.js';
import { generateInvoicePdf } from '../services/pdf-service.js';
import { formatearNumeroComprobante } from '../lib/format.js';

export async function rutasInvoices(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** POST /api/invoices/preview - calcula todo sin emitir. */
  app.post('/preview', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const body = parsear(invoiceInputSchema, request.body);
    return previewInvoice(body, studioId);
  });

  /** POST /api/invoices - emite contra ARCA en tiempo real. */
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { studioId, userId } = sesionDe(request);
    const body = parsear(invoiceInputSchema, request.body);
    const comprobante = await emitInvoice(body, studioId, userId, { ip: request.ip });
    return reply.status(201).send(comprobante);
  });

  /** GET /api/invoices?companyId=&estado=&desde=&hasta=&search=&page=&pageSize= */
  app.get('/', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const query = parsear(listInvoicesQuerySchema, request.query);
    return listInvoices(query, studioId);
  });

  /** GET /api/invoices/:id */
  app.get('/:id', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    return getInvoice(id, studioId);
  });

  /** GET /api/invoices/:id/pdf */
  app.get('/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);

    const comprobante = await getInvoice(id, studioId);
    const pdf = await generateInvoicePdf(id, studioId);

    const nombre = `${comprobante.descripcionComprobante.replace(/\s+/g, '-')}-${formatearNumeroComprobante(
      comprobante.ptoVta,
      comprobante.cbteNro,
    )}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${nombre}"`)
      .header('Content-Length', String(pdf.length))
      .send(pdf);
  });

  /** POST /api/invoices/:id/credit-note */
  app.post('/:id/credit-note', async (request: FastifyRequest, reply: FastifyReply) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    const body = parsear(creditNoteSchema, request.body ?? {});
    const nota = await createCreditNote(id, body, studioId, userId, request.ip);
    return reply.status(201).send(nota);
  });

  /** POST /api/invoices/:id/retry */
  app.post('/:id/retry', async (request: FastifyRequest) => {
    const { studioId, userId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    return retryInvoice(id, studioId, userId, request.ip);
  });

  /** GET /api/invoices/:id/arca-log */
  app.get('/:id/arca-log', async (request: FastifyRequest) => {
    const { studioId } = sesionDe(request);
    const { id } = parsear(idParamsSchema, request.params);
    return getArcaLog(id, studioId);
  });
}
