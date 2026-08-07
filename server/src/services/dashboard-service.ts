/**
 * Metricas del tablero (`GET /api/dashboard`).
 *
 * Todo se calcula sobre los comprobantes EMITIDOS del estudio (nunca de otro
 * tenant) dentro del periodo pedido.
 */

import type { Prisma } from '@prisma/client';

import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { aFechaIso, formatearNumeroComprobante, hoyUtc, sumarDias } from '../lib/format.js';
import { descripcionComprobante, letraDeComprobante } from '../domain/catalogs.js';
import type { DashboardQuery } from '../lib/validation.js';
import type { ArcaEnvironment, ArcaHealth } from '../domain/arca-port.js';
import { getArcaClient } from '../arca/index.js';

export interface PuntoSerie {
  fecha: string;
  cantidad: number;
  total: number;
}

export interface ResumenPorTipo {
  cbteTipo: number;
  descripcion: string;
  letra: string;
  cantidad: number;
  total: number;
}

export interface FacturaResumida {
  id: string;
  numeroFormateado: string;
  descripcionComprobante: string;
  letra: string;
  fechaCbte: string;
  receptorRazonSocial: string | null;
  impTotal: number;
  estado: string;
  cae: string | null;
  empresa: string;
  pdfUrl: string;
}

export interface DashboardResultado {
  periodo: {
    nombre: string;
    desde: string;
    hasta: string;
  };
  emitidas: number;
  totalFacturado: number;
  ivaLiquidado: number;
  promedio: number;
  /** Variacion porcentual del total facturado contra el periodo anterior. */
  variacion: number | null;
  rechazadas: number;
  borradores: number;
  ultimasFacturas: FacturaResumida[];
  serieDiaria: PuntoSerie[];
  porTipo: ResumenPorTipo[];
  estadoArca: {
    ok: boolean;
    environment: string;
    appServer: string | null;
    dbServer: string | null;
    authServer: string | null;
    demoMode: boolean;
    mensaje: string;
  };
}

const NOMBRES_PERIODO: Record<DashboardQuery['periodo'], string> = {
  hoy: 'Hoy',
  semana: 'Ultimos 7 dias',
  mes: 'Ultimos 30 dias',
  trimestre: 'Ultimos 90 dias',
  anio: 'Ultimos 12 meses',
};

const DIAS_PERIODO: Record<DashboardQuery['periodo'], number> = {
  hoy: 1,
  semana: 7,
  mes: 30,
  trimestre: 90,
  anio: 365,
};

export async function getDashboard(
  query: DashboardQuery,
  studioId: string,
): Promise<DashboardResultado> {
  const dias = DIAS_PERIODO[query.periodo];
  const hasta = hoyUtc();
  const desde = sumarDias(hasta, -(dias - 1));
  const desdeAnterior = sumarDias(desde, -dias);
  const hastaAnterior = sumarDias(desde, -1);

  let environment: ArcaEnvironment = 'HOMO';
  if (query.companyId) {
    const empresa = await prisma.company.findFirst({
      where: { id: query.companyId, studioId },
      select: { environment: true },
    });
    if (!empresa) throw notFound('No se encontro la empresa solicitada');
    environment = empresa.environment === 'PROD' ? 'PROD' : 'HOMO';
  }

  const base: Prisma.InvoiceWhereInput = { company: { studioId } };
  if (query.companyId) base.companyId = query.companyId;

  const enRango: Prisma.InvoiceWhereInput = {
    ...base,
    estado: 'EMITIDA',
    fechaCbte: { gte: desde, lte: hasta },
  };
  const enRangoAnterior: Prisma.InvoiceWhereInput = {
    ...base,
    estado: 'EMITIDA',
    fechaCbte: { gte: desdeAnterior, lte: hastaAnterior },
  };

  const [agregado, agregadoAnterior, rechazadas, borradores, porFecha, porTipoRaw, ultimas] =
    await Promise.all([
      prisma.invoice.aggregate({
        where: enRango,
        _count: { _all: true },
        _sum: { impTotal: true, impIVA: true },
        _avg: { impTotal: true },
      }),
      prisma.invoice.aggregate({
        where: enRangoAnterior,
        _sum: { impTotal: true },
      }),
      prisma.invoice.count({ where: { ...base, estado: 'RECHAZADA' } }),
      prisma.invoice.count({ where: { ...base, estado: 'BORRADOR' } }),
      prisma.invoice.groupBy({
        by: ['fechaCbte'],
        where: enRango,
        _count: { _all: true },
        _sum: { impTotal: true },
      }),
      prisma.invoice.groupBy({
        by: ['cbteTipo'],
        where: enRango,
        _count: { _all: true },
        _sum: { impTotal: true },
      }),
      prisma.invoice.findMany({
        where: base,
        orderBy: [{ createdAt: 'desc' }],
        take: 8,
        include: { company: { select: { razonSocial: true } } },
      }),
    ]);

  const totalFacturado = redondear(agregado._sum.impTotal ?? 0);
  const totalAnterior = redondear(agregadoAnterior._sum.impTotal ?? 0);

  return {
    periodo: {
      nombre: NOMBRES_PERIODO[query.periodo],
      desde: aFechaIso(desde),
      hasta: aFechaIso(hasta),
    },
    emitidas: agregado._count._all,
    totalFacturado,
    ivaLiquidado: redondear(agregado._sum.impIVA ?? 0),
    promedio: redondear(agregado._avg.impTotal ?? 0),
    variacion:
      totalAnterior > 0 ? redondear(((totalFacturado - totalAnterior) / totalAnterior) * 100) : null,
    rechazadas,
    borradores,
    ultimasFacturas: ultimas.map((inv) => ({
      id: inv.id,
      numeroFormateado: formatearNumeroComprobante(inv.ptoVta, inv.cbteNro),
      descripcionComprobante: descripcionComprobante(inv.cbteTipo),
      letra: letraDeComprobante(inv.cbteTipo),
      fechaCbte: aFechaIso(inv.fechaCbte),
      receptorRazonSocial: inv.receptorRazonSocial,
      impTotal: inv.impTotal,
      estado: inv.estado,
      cae: inv.cae,
      empresa: inv.company.razonSocial,
      pdfUrl: `/api/invoices/${inv.id}/pdf`,
    })),
    serieDiaria: completarSerie(
      desde,
      dias,
      porFecha.map((p) => ({
        fecha: aFechaIso(p.fechaCbte),
        cantidad: p._count._all,
        total: redondear(p._sum.impTotal ?? 0),
      })),
    ),
    porTipo: porTipoRaw
      .map((p) => ({
        cbteTipo: p.cbteTipo,
        descripcion: descripcionComprobante(p.cbteTipo),
        letra: letraDeComprobante(p.cbteTipo),
        cantidad: p._count._all,
        total: redondear(p._sum.impTotal ?? 0),
      }))
      .sort((a, b) => b.total - a.total),
    estadoArca: await estadoArca(environment),
  };
}

/** Rellena los dias sin comprobantes con ceros para que el grafico no salte. */
function completarSerie(desde: Date, dias: number, puntos: PuntoSerie[]): PuntoSerie[] {
  const mapa = new Map(puntos.map((p) => [p.fecha, p]));
  const serie: PuntoSerie[] = [];
  for (let i = 0; i < dias; i += 1) {
    const fecha = aFechaIso(sumarDias(desde, i));
    serie.push(mapa.get(fecha) ?? { fecha, cantidad: 0, total: 0 });
  }
  return serie;
}

async function estadoArca(environment: ArcaEnvironment): Promise<DashboardResultado['estadoArca']> {
  try {
    const health: ArcaHealth = await getArcaClient().health(environment);
    return {
      ok: health.ok,
      environment,
      appServer: health.appServer,
      dbServer: health.dbServer,
      authServer: health.authServer,
      demoMode: config.demoMode,
      mensaje: health.ok
        ? 'Los servicios de ARCA responden con normalidad'
        : 'Alguno de los servicios de ARCA no esta respondiendo',
    };
  } catch (err) {
    return {
      ok: false,
      environment,
      appServer: null,
      dbServer: null,
      authServer: null,
      demoMode: config.demoMode,
      mensaje: `No se pudo consultar el estado de ARCA: ${
        err instanceof Error ? err.message : 'error desconocido'
      }`,
    };
  }
}

const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
