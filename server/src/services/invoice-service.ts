/**
 * Servicio de comprobantes: el corazon de la app.
 *
 * Emitir un comprobante electronico es una operacion en tiempo real contra
 * ARCA que **no se puede deshacer**: una vez que ARCA otorga el CAE, el numero
 * quedo consumido. Por eso el flujo es:
 *
 *   1. Validar y calcular importes (domain/totals.ts).
 *   2. Persistir el comprobante en BORRADOR (con items y tributos) para que
 *      nunca se pierda lo que el usuario cargo.
 *   3. Resolver credenciales y numero.
 *   4. Pedir el CAE.
 *   5. Guardar el resultado (EMITIDA o RECHAZADA) junto con el XML crudo.
 *
 * Concurrencia: dos usuarios emitiendo a la vez no pueden pedir el mismo
 * numero. Se serializa por (companyId, ptoVta, cbteTipo) con un cerrojo en
 * memoria, y ademas se reserva el numero en la base ANTES de llamar a ARCA;
 * si el unique constraint choca (otro proceso gano la carrera) se reintenta
 * con el numero siguiente hasta 3 veces.
 */

import type { Company, Customer, Prisma } from '@prisma/client';

import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import {
  AppError,
  arcaConfigError,
  arcaRejected,
  badRequest,
  conflict,
  esErrorPrisma,
  notFound,
  type DetalleError,
} from '../lib/errors.js';
import {
  aFechaArca,
  aFechaIso,
  formatearNumeroComprobante,
  hoyUtc,
  parsearFechaIso,
  serializarEmpresa,
  type EmpresaSerializada,
} from '../lib/format.js';
import {
  validarNegocioComprobante,
  type CreditNoteInput,
  type InvoiceInput,
  type ListInvoicesQuery,
} from '../lib/validation.js';
import {
  descripcionComprobante,
  esNotaDeCredito,
  esNotaDeDebito,
  letraDeComprobante,
  notaDeCreditoPara,
  requierePeriodoServicio,
  tipoComprobanteSugerido,
} from '../domain/catalogs.js';
import {
  calcularTotales,
  validarTotales,
  type InvoiceTotals,
  type LineInput,
  type TributoInput,
} from '../domain/totals.js';
import type {
  ArcaCbteAsoc,
  ArcaCredentials,
  ArcaEnvironment,
  ArcaInvoiceRequest,
  ArcaIvaLine,
  ArcaObservacion,
  ArcaTributoLine,
} from '../domain/arca-port.js';
import { buildQrUrl, getArcaClient } from '../arca/index.js';
import { decryptSecret } from '../lib/crypto.js';

/* -------------------------------------------------------------------------- */
/* Tipos                                                                       */
/* -------------------------------------------------------------------------- */

const includeComprobante = {
  items: { orderBy: { orden: 'asc' as const } },
  tributos: true,
  company: true,
  customer: true,
};

export type InvoiceCompleto = Prisma.InvoiceGetPayload<{
  include: typeof includeComprobante;
}>;

export interface ItemSerializado {
  id: string;
  productId: string | null;
  orden: number;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  bonificacion: number;
  ivaId: number;
  alicuota: number;
  subtotalNeto: number;
  importeIva: number;
  subtotalConIva: number;
}

export interface ClienteSerializado {
  id: string;
  razonSocial: string;
  docTipo: number;
  docNro: string;
  condicionIvaReceptorId: number;
  email: string | null;
  telefono: string | null;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  notas: string | null;
  companyId: string | null;
  active: boolean;
}

export interface ComprobanteSerializado {
  id: string;
  estado: string;
  cae: string | null;
  caeVto: string | null;
  cbteNro: number | null;
  ptoVta: number;
  cbteTipo: number;
  numeroFormateado: string;
  letra: string;
  descripcionComprobante: string;
  concepto: number;
  docTipo: number;
  docNro: string;
  receptorRazonSocial: string | null;
  receptorDomicilio: string | null;
  condicionIvaReceptorId: number;
  fechaCbte: string;
  fchServDesde: string | null;
  fchServHasta: string | null;
  fchVtoPago: string | null;
  monId: string;
  monCotiz: number;
  impNeto: number;
  impIVA: number;
  impTotConc: number;
  impOpEx: number;
  impTrib: number;
  impTotal: number;
  qrUrl: string | null;
  pdfUrl: string;
  resultado: string | null;
  /** Observaciones devueltas por ARCA (no bloquean la emision). */
  observaciones: DetalleError[];
  /** Errores devueltos por ARCA cuando el resultado es "R". */
  errores: DetalleError[];
  /** Texto libre que el usuario escribio al pie del comprobante. */
  observacionesTexto: string | null;
  cbtesAsoc: ArcaCbteAsoc[];
  environment: string;
  emitidaAt: string | null;
  createdAt: string;
  items: ItemSerializado[];
  tributos: Array<{
    id: string;
    tributoId: number;
    descripcion: string;
    baseImp: number;
    alicuota: number;
    importe: number;
  }>;
  company: EmpresaSerializada;
  customer: ClienteSerializado | null;
}

export interface ResultadoPreview {
  totals: InvoiceTotals;
  proximoNumero: number;
  ultimoAutorizado: number;
  numeroFormateado: string;
  cbteTipoSugerido: number;
  cbteTipo: number;
  letra: string;
  descripcionComprobante: string;
  ptoVta: number;
  concepto: number;
  fechaCbte: string;
  docTipo: number;
  docNro: string;
  receptorRazonSocial: string | null;
  condicionIvaReceptorId: number;
  validaciones: string[];
  company: EmpresaSerializada;
  customer: ClienteSerializado | null;
}

/** Opciones internas de emision (notas de credito/debito). */
interface OpcionesEmision {
  cbteTipoForzado?: number;
  cbtesAsoc?: ArcaCbteAsoc[];
  ip?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Cerrojo por (empresa, punto de venta, tipo)                                 */
/* -------------------------------------------------------------------------- */

const cerrojos = new Map<string, Promise<void>>();

/**
 * Serializa las secciones criticas por clave. Las emisiones de la misma
 * (empresa, ptoVta, tipo) se encolan; las de claves distintas corren en
 * paralelo sin bloquearse.
 */
export async function conCerrojo<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const anterior = cerrojos.get(clave) ?? Promise.resolve();

  let liberar: () => void = () => undefined;
  const propio = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  const cadena = anterior.then(
    () => propio,
    () => propio,
  );
  cerrojos.set(clave, cadena);

  await anterior.catch(() => undefined);
  try {
    return await fn();
  } finally {
    liberar();
    if (cerrojos.get(clave) === cadena) cerrojos.delete(clave);
  }
}

const claveNumeracion = (
  companyId: string,
  ptoVta: number,
  cbteTipo: number,
  environment: string,
): string => `${companyId}:${ptoVta}:${cbteTipo}:${environment}`;

const MAX_INTENTOS_NUMERO = 3;

/* -------------------------------------------------------------------------- */
/* Credenciales                                                                */
/* -------------------------------------------------------------------------- */

function entornoDe(empresa: Company): ArcaEnvironment {
  return empresa.environment === 'PROD' ? 'PROD' : 'HOMO';
}

/** true si el comprobante se emite contra la simulacion o contra homologacion. */
export function esComprobanteDePrueba(environment: string): boolean {
  return config.demoMode || environment !== 'PROD';
}

/**
 * Arma las credenciales ARCA de la empresa descifrando el certificado y la
 * clave privada. En modo demo se admite una empresa sin credenciales.
 */
export function construirCredenciales(empresa: Company): ArcaCredentials {
  const environment = entornoDe(empresa);
  const tieneCredenciales = Boolean(empresa.certPemEnc && empresa.keyPemEnc);

  if (!tieneCredenciales) {
    if (!config.demoMode) {
      throw arcaConfigError(
        `La empresa ${empresa.razonSocial} no tiene cargado el certificado digital de ARCA. ` +
          'Subilo desde Empresas > Credenciales, o activa el modo demo (ARCA_DEMO_MODE=true) para probar sin certificados.',
      );
    }
    return {
      companyId: empresa.id,
      cuit: empresa.cuit,
      environment,
      certPem: '',
      keyPem: '',
    };
  }

  try {
    return {
      companyId: empresa.id,
      cuit: empresa.cuit,
      environment,
      certPem: decryptSecret(empresa.certPemEnc as string),
      keyPem: decryptSecret(empresa.keyPemEnc as string),
    };
  } catch {
    throw arcaConfigError(
      `No se pudieron descifrar las credenciales de ${empresa.razonSocial}. ` +
        'Revisa que APP_ENCRYPTION_KEY sea la misma con la que se guardaron y volve a subir el certificado.',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Preparacion del comprobante                                                 */
/* -------------------------------------------------------------------------- */

interface ComprobantePreparado {
  empresa: Company;
  cliente: Customer | null;
  ptoVta: number;
  cbteTipo: number;
  cbteTipoSugerido: number;
  concepto: number;
  docTipo: number;
  docNro: string;
  receptorRazonSocial: string | null;
  receptorDomicilio: string | null;
  condicionIvaReceptorId: number;
  fechaCbte: Date;
  fchServDesde: Date | null;
  fchServHasta: Date | null;
  fchVtoPago: Date | null;
  monId: string;
  monCotiz: number;
  totals: InvoiceTotals;
  lineas: LineInput[];
  problemas: string[];
  cbtesAsoc: ArcaCbteAsoc[];
}

const soloDigitos = (v: string): string => v.replace(/\D/g, '');

async function prepararComprobante(
  input: InvoiceInput,
  studioId: string,
  opciones: OpcionesEmision = {},
): Promise<ComprobantePreparado> {
  const empresa = await prisma.company.findFirst({
    where: { id: input.companyId, studioId },
  });
  if (!empresa) throw notFound('No se encontro la empresa emisora');
  if (!empresa.active) {
    throw badRequest(`La empresa ${empresa.razonSocial} esta dada de baja y no puede emitir`);
  }

  let cliente: Customer | null = null;
  if (input.customerId) {
    cliente = await prisma.customer.findFirst({
      where: { id: input.customerId, studioId },
    });
    if (!cliente) throw notFound('No se encontro el cliente indicado');
  }

  const docTipo = input.docTipo ?? cliente?.docTipo ?? 99;
  const docNroCrudo = input.docNro ?? cliente?.docNro ?? '0';
  const docNro = docTipo === 99 ? '0' : soloDigitos(docNroCrudo) || '0';
  const condicionIvaReceptorId =
    input.condicionIvaReceptorId ?? cliente?.condicionIvaReceptorId ?? 5;
  const receptorRazonSocial =
    input.receptorRazonSocial ?? cliente?.razonSocial ?? (docTipo === 99 ? 'Consumidor Final' : null);
  const receptorDomicilio = input.receptorDomicilio ?? cliente?.domicilio ?? null;

  const cbteTipoSugerido = tipoComprobanteSugerido(empresa.condicionIva, condicionIvaReceptorId);
  const cbteTipo = opciones.cbteTipoForzado ?? input.cbteTipo ?? cbteTipoSugerido;
  const ptoVta = input.ptoVta ?? empresa.defaultPtoVta;

  const fechaCbte = input.fechaCbte ? parsearFechaIso(input.fechaCbte) : hoyUtc();
  const incluyeServicios = requierePeriodoServicio(input.concepto);
  const fchServDesde = input.fchServDesde ? parsearFechaIso(input.fchServDesde) : null;
  const fchServHasta = input.fchServHasta ? parsearFechaIso(input.fchServHasta) : null;
  const fchVtoPago = input.fchVtoPago ? parsearFechaIso(input.fchVtoPago) : null;

  const lineas: LineInput[] = input.items.map((item) => ({
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    bonificacion: item.bonificacion,
    ivaId: item.ivaId,
    precioConIva: item.precioConIva,
  }));

  const tributos: TributoInput[] = input.tributos.map((t) => ({
    tributoId: t.tributoId,
    descripcion: t.descripcion,
    baseImp: t.baseImp,
    alicuota: t.alicuota,
  }));

  let totals: InvoiceTotals;
  try {
    totals = calcularTotales(lineas, cbteTipo, tributos);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'No se pudieron calcular los importes');
  }

  const cbtesAsoc = opciones.cbtesAsoc ?? [];

  const problemas = [
    ...validarTotales(totals),
    ...validarNegocioComprobante({
      condicionIvaEmisor: empresa.condicionIva,
      cbteTipo,
      concepto: input.concepto,
      docTipo,
      docNro,
      condicionIvaReceptorId,
      impTotal: totals.impTotal,
      fchServDesde,
      fchServHasta,
      fchVtoPago,
      tieneAsociado:
        esNotaDeCredito(cbteTipo) || esNotaDeDebito(cbteTipo) ? cbtesAsoc.length > 0 : true,
    }),
  ];

  // La fecha del comprobante no puede estar muy lejos de hoy (ARCA admite
  // +/- 5 dias para productos y +/- 10 para servicios).
  const margenDias = incluyeServicios ? 10 : 5;
  const diferenciaDias = Math.round((fechaCbte.getTime() - hoyUtc().getTime()) / 86_400_000);
  if (Math.abs(diferenciaDias) > margenDias) {
    problemas.push(
      `La fecha del comprobante (${aFechaIso(fechaCbte)}) esta fuera del rango que acepta ARCA: ` +
        `hasta ${margenDias} dias antes o despues de hoy`,
    );
  }

  return {
    empresa,
    cliente,
    ptoVta,
    cbteTipo,
    cbteTipoSugerido,
    concepto: input.concepto,
    docTipo,
    docNro,
    receptorRazonSocial,
    receptorDomicilio,
    condicionIvaReceptorId,
    fechaCbte,
    fchServDesde: incluyeServicios ? fchServDesde : null,
    fchServHasta: incluyeServicios ? fchServHasta : null,
    fchVtoPago: incluyeServicios ? fchVtoPago : null,
    monId: input.monId,
    monCotiz: input.monCotiz,
    totals,
    lineas,
    problemas,
    cbtesAsoc,
  };
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Calcula todo lo que se va a mandar a ARCA sin emitir nada: importes, tipo
 * de comprobante sugerido, proximo numero y las validaciones que fallarian.
 */
export async function previewInvoice(
  input: InvoiceInput,
  studioId: string,
): Promise<ResultadoPreview> {
  const prep = await prepararComprobante(input, studioId);
  const validaciones = [...prep.problemas];

  let ultimoAutorizado = 0;
  try {
    const client = getArcaClient();
    const creds = construirCredenciales(prep.empresa);
    ultimoAutorizado = await client.getUltimoAutorizado(creds, prep.ptoVta, prep.cbteTipo);
  } catch (err) {
    // El preview nunca falla por ARCA: se cae a la numeracion local y se avisa.
    ultimoAutorizado = await ultimoNumeroLocal(
      prep.empresa.id,
      prep.ptoVta,
      prep.cbteTipo,
      prep.empresa.environment,
    );
    validaciones.push(
      `No se pudo consultar el ultimo numero autorizado en ARCA (${
        err instanceof Error ? err.message : 'error desconocido'
      }). Se muestra la numeracion local, que puede no coincidir.`,
    );
  }

  const proximoNumero = ultimoAutorizado + 1;

  return {
    totals: prep.totals,
    proximoNumero,
    ultimoAutorizado,
    numeroFormateado: formatearNumeroComprobante(prep.ptoVta, proximoNumero),
    cbteTipoSugerido: prep.cbteTipoSugerido,
    cbteTipo: prep.cbteTipo,
    letra: letraDeComprobante(prep.cbteTipo),
    descripcionComprobante: descripcionComprobante(prep.cbteTipo),
    ptoVta: prep.ptoVta,
    concepto: prep.concepto,
    fechaCbte: aFechaIso(prep.fechaCbte),
    docTipo: prep.docTipo,
    docNro: prep.docNro,
    receptorRazonSocial: prep.receptorRazonSocial,
    condicionIvaReceptorId: prep.condicionIvaReceptorId,
    validaciones,
    company: serializarEmpresa(prep.empresa),
    customer: prep.cliente ? serializarCliente(prep.cliente) : null,
  };
}

async function ultimoNumeroLocal(
  companyId: string,
  ptoVta: number,
  cbteTipo: number,
  environment: string,
): Promise<number> {
  const agregado = await prisma.invoice.aggregate({
    _max: { cbteNro: true },
    where: { companyId, ptoVta, cbteTipo, environment, estado: 'EMITIDA' },
  });
  return agregado._max.cbteNro ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Emision                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Emite un comprobante contra ARCA en tiempo real.
 *
 * Si ARCA rechaza, el comprobante queda guardado en RECHAZADA con los errores
 * y se lanza un error 422 (`ARCA_REJECTED`) para que el usuario pueda corregir
 * y reintentar con `retryInvoice`.
 */
export async function emitInvoice(
  input: InvoiceInput,
  studioId: string,
  userId: string,
  opciones: OpcionesEmision = {},
): Promise<ComprobanteSerializado> {
  const prep = await prepararComprobante(input, studioId, opciones);

  if (prep.problemas.length > 0) {
    throw badRequest(
      `El comprobante no se puede emitir: ${prep.problemas[0]}`,
      prep.problemas.map((msg, i) => ({ code: i + 1, msg })),
    );
  }

  // 2. Persistir en BORRADOR (con items y tributos) dentro de una transaccion.
  const borrador = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        companyId: prep.empresa.id,
        customerId: prep.cliente?.id ?? null,
        createdById: userId,
        ptoVta: prep.ptoVta,
        cbteTipo: prep.cbteTipo,
        cbteNro: null,
        concepto: prep.concepto,
        docTipo: prep.docTipo,
        docNro: prep.docNro,
        receptorRazonSocial: prep.receptorRazonSocial,
        receptorDomicilio: prep.receptorDomicilio,
        condicionIvaReceptorId: prep.condicionIvaReceptorId,
        fechaCbte: prep.fechaCbte,
        fchServDesde: prep.fchServDesde,
        fchServHasta: prep.fchServHasta,
        fchVtoPago: prep.fchVtoPago,
        monId: prep.monId,
        monCotiz: prep.monCotiz,
        impNeto: prep.totals.impNeto,
        impIVA: prep.totals.impIVA,
        impTotConc: prep.totals.impTotConc,
        impOpEx: prep.totals.impOpEx,
        impTrib: prep.totals.impTrib,
        impTotal: prep.totals.impTotal,
        estado: 'BORRADOR',
        environment: prep.empresa.environment,
        observaciones: input.observaciones ?? null,
        cbtesAsoc: prep.cbtesAsoc.length > 0 ? JSON.stringify(prep.cbtesAsoc) : null,
        items: {
          create: prep.totals.items.map((linea, indice) => ({
            productId: input.items[indice]?.productId ?? null,
            orden: indice,
            descripcion: linea.descripcion,
            cantidad: linea.cantidad,
            unidad: input.items[indice]?.unidad ?? 'unidad',
            precioUnitario: linea.precioUnitario,
            bonificacion: linea.bonificacion,
            ivaId: linea.ivaId,
            subtotalNeto: linea.subtotalNeto,
            importeIva: linea.importeIva,
            subtotalConIva: linea.subtotalConIva,
          })),
        },
        tributos: {
          create: prep.totals.tributos.map((t) => ({
            tributoId: t.Id,
            descripcion: t.Desc,
            baseImp: t.BaseImp,
            alicuota: t.Alic,
            importe: t.Importe,
          })),
        },
      },
      select: { id: true },
    });
    return invoice;
  });

  return autorizarComprobante(borrador.id, studioId, userId, opciones.ip ?? null);
}

/**
 * Pide el CAE para un comprobante ya persistido y guarda el resultado.
 * Es el paso que comparten la emision inicial, el reintento y las notas de
 * credito.
 */
export async function autorizarComprobante(
  invoiceId: string,
  studioId: string,
  userId: string | null,
  ip: string | null = null,
): Promise<ComprobanteSerializado> {
  const comprobante = await cargarComprobante(invoiceId, studioId);
  const empresa = comprobante.company;

  if (comprobante.estado === 'EMITIDA') {
    throw conflict('El comprobante ya fue emitido y tiene CAE: no se puede volver a emitir');
  }
  if (comprobante.estado === 'ANULADA') {
    throw conflict('El comprobante esta anulado');
  }

  const client = getArcaClient();
  const creds = construirCredenciales(empresa);
  const clave = claveNumeracion(
    empresa.id,
    comprobante.ptoVta,
    comprobante.cbteTipo,
    comprobante.environment,
  );

  return conCerrojo(clave, async () => {
    // 4. Numero: ultimo autorizado en ARCA + 1.
    const ultimoAutorizado = await client.getUltimoAutorizado(
      creds,
      comprobante.ptoVta,
      comprobante.cbteTipo,
    );

    // Reserva local del numero. El unique constraint
    // (companyId, ptoVta, cbteTipo, cbteNro, environment) es la ultima linea
    // de defensa contra dos emisiones simultaneas.
    let numero = ultimoAutorizado + 1;
    let reservado = false;
    for (let intento = 1; intento <= MAX_INTENTOS_NUMERO && !reservado; intento += 1) {
      try {
        await prisma.invoice.update({
          where: { id: comprobante.id },
          data: { cbteNro: numero },
        });
        reservado = true;
      } catch (err) {
        if (esErrorPrisma(err, 'P2002')) {
          numero += 1;
          continue;
        }
        throw err;
      }
    }
    if (!reservado) {
      throw conflict(
        `No se pudo reservar un numero libre para ${descripcionComprobante(comprobante.cbteTipo)} ` +
          `en el punto de venta ${comprobante.ptoVta} despues de ${MAX_INTENTOS_NUMERO} intentos. ` +
          'Volve a intentar en unos segundos.',
      );
    }

    const solicitud = construirSolicitud(comprobante, numero);

    // 5. Pedir el CAE.
    const respuesta = await client.solicitarCAE(creds, solicitud);

    const observaciones = normalizarObs(respuesta.observaciones);
    const errores = normalizarObs(respuesta.errores);
    const rawRequest = respuesta.rawRequest || JSON.stringify(solicitud);

    if (respuesta.resultado === 'A' && respuesta.cae) {
      const cbteNroFinal = respuesta.cbteNro > 0 ? respuesta.cbteNro : numero;
      const qrUrl = construirQr({
        empresa,
        comprobante,
        cbteNro: cbteNroFinal,
        cae: respuesta.cae,
      });

      const datosOk: Prisma.InvoiceUpdateInput = {
        estado: 'EMITIDA',
        resultado: 'A',
        cae: respuesta.cae,
        caeVto: respuesta.caeVencimiento,
        cbteNro: cbteNroFinal,
        qrPayload: qrUrl,
        arcaObs: observaciones.length > 0 ? JSON.stringify(observaciones) : null,
        arcaErrors: null,
        arcaRequest: rawRequest,
        arcaResponse: respuesta.rawResponse,
        emitidaAt: new Date(),
      };

      try {
        await prisma.invoice.update({ where: { id: comprobante.id }, data: datosOk });
      } catch (err) {
        if (esErrorPrisma(err, 'P2002')) {
          // ARCA devolvio un numero que ya estaba tomado localmente: se guarda
          // igual con el numero reservado y se deja constancia.
          await prisma.invoice.update({
            where: { id: comprobante.id },
            data: { ...datosOk, cbteNro: numero },
          });
        } else {
          throw err;
        }
      }

      await registrarAuditoria({
        userId,
        studioId,
        action: 'COMPROBANTE_EMITIDO',
        entityId: comprobante.id,
        ip,
        detail: {
          numero: formatearNumeroComprobante(comprobante.ptoVta, cbteNroFinal),
          cbteTipo: comprobante.cbteTipo,
          cae: respuesta.cae,
          impTotal: comprobante.impTotal,
          environment: comprobante.environment,
        },
      });

      return serializarComprobante(await cargarComprobante(comprobante.id, studioId));
    }

    // 6b. Rechazado: se guarda todo para poder corregir y reintentar.
    await prisma.invoice.update({
      where: { id: comprobante.id },
      data: {
        estado: 'RECHAZADA',
        resultado: respuesta.resultado,
        // Se libera el numero: un comprobante rechazado no consume numeracion.
        cbteNro: null,
        cae: null,
        caeVto: null,
        arcaObs: observaciones.length > 0 ? JSON.stringify(observaciones) : null,
        arcaErrors: JSON.stringify(errores.length > 0 ? errores : [
          { code: 0, msg: 'ARCA rechazo el comprobante sin detallar el motivo' },
        ]),
        arcaRequest: rawRequest,
        arcaResponse: respuesta.rawResponse,
      },
    });

    await registrarAuditoria({
      userId,
      studioId,
      action: 'COMPROBANTE_RECHAZADO',
      entityId: comprobante.id,
      ip,
      detail: { errores, cbteTipo: comprobante.cbteTipo, ptoVta: comprobante.ptoVta },
    });

    const detalle = errores.length > 0 ? errores : observaciones;
    throw arcaRejected(
      detalle.length > 0
        ? `ARCA rechazo el comprobante: ${detalle.map((e) => e.msg).join(' | ')}`
        : 'ARCA rechazo el comprobante',
      detalle,
    );
  });
}

/** Arma el request de FECAESolicitar a partir del comprobante persistido. */
function construirSolicitud(
  comprobante: InvoiceCompleto,
  numero: number,
): ArcaInvoiceRequest {
  const iva = agruparIvaDeItems(comprobante);
  const tributos: ArcaTributoLine[] = comprobante.tributos.map((t) => ({
    Id: t.tributoId,
    Desc: t.descripcion,
    BaseImp: t.baseImp,
    Alic: t.alicuota,
    Importe: t.importe,
  }));

  const solicitud: ArcaInvoiceRequest = {
    PtoVta: comprobante.ptoVta,
    CbteTipo: comprobante.cbteTipo,
    Concepto: comprobante.concepto,
    DocTipo: comprobante.docTipo,
    DocNro: Number(soloDigitos(comprobante.docNro) || '0'),
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: aFechaArca(comprobante.fechaCbte),
    ImpTotal: comprobante.impTotal,
    ImpTotConc: comprobante.impTotConc,
    ImpNeto: comprobante.impNeto,
    ImpOpEx: comprobante.impOpEx,
    ImpTrib: comprobante.impTrib,
    ImpIVA: comprobante.impIVA,
    MonId: comprobante.monId,
    MonCotiz: comprobante.monCotiz,
    CondicionIVAReceptorId: comprobante.condicionIvaReceptorId,
  };

  if (requierePeriodoServicio(comprobante.concepto)) {
    if (comprobante.fchServDesde) solicitud.FchServDesde = aFechaArca(comprobante.fchServDesde);
    if (comprobante.fchServHasta) solicitud.FchServHasta = aFechaArca(comprobante.fchServHasta);
    if (comprobante.fchVtoPago) solicitud.FchVtoPago = aFechaArca(comprobante.fchVtoPago);
  }

  if (iva.length > 0) solicitud.Iva = iva;
  if (tributos.length > 0) solicitud.Tributos = tributos;

  const asociados = parsearJson<ArcaCbteAsoc[]>(comprobante.cbtesAsoc, []);
  if (asociados.length > 0) solicitud.CbtesAsoc = asociados;

  return solicitud;
}

/**
 * Agrupa el IVA por alicuota usando los importes YA persistidos en cada item.
 * No se recalcula desde el precio unitario porque el flag "precio con IVA
 * incluido" no se persiste y el resultado podria diferir en centavos.
 */
function agruparIvaDeItems(comprobante: InvoiceCompleto): ArcaIvaLine[] {
  if (!discriminaIvaAnteArca(comprobante.cbteTipo)) return [];

  const acumulado = new Map<number, { base: number; importe: number }>();
  for (const item of comprobante.items) {
    const acc = acumulado.get(item.ivaId) ?? { base: 0, importe: 0 };
    acc.base += Math.round(item.subtotalNeto * 100);
    acc.importe += Math.round(item.importeIva * 100);
    acumulado.set(item.ivaId, acc);
  }

  return [...acumulado.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, acc]) => ({ Id: id, BaseImp: acc.base / 100, Importe: acc.importe / 100 }));
}

/** Clase C no informa el array de alicuotas a WSFEv1. */
function discriminaIvaAnteArca(cbteTipo: number): boolean {
  return letraDeComprobante(cbteTipo) !== 'C';
}

/** Payload del QR obligatorio (RG 4892). */
function construirQr(args: {
  empresa: Company;
  comprobante: InvoiceCompleto;
  cbteNro: number;
  cae: string;
}): string {
  const { empresa, comprobante, cbteNro, cae } = args;
  return buildQrUrl({
    ver: 1,
    fecha: aFechaIso(comprobante.fechaCbte),
    cuit: Number(soloDigitos(empresa.cuit)),
    ptoVta: comprobante.ptoVta,
    tipoCmp: comprobante.cbteTipo,
    nroCmp: cbteNro,
    importe: comprobante.impTotal,
    moneda: comprobante.monId,
    ctz: comprobante.monCotiz,
    tipoDocRec: comprobante.docTipo,
    nroDocRec: Number(soloDigitos(comprobante.docNro) || '0'),
    tipoCodAut: 'E',
    codAut: Number(cae),
  });
}

/* -------------------------------------------------------------------------- */
/* Reintento                                                                   */
/* -------------------------------------------------------------------------- */

/** Reintenta un comprobante que quedo en BORRADOR o RECHAZADA. */
export async function retryInvoice(
  invoiceId: string,
  studioId: string,
  userId: string,
  ip: string | null = null,
): Promise<ComprobanteSerializado> {
  const comprobante = await cargarComprobante(invoiceId, studioId);

  if (comprobante.estado === 'EMITIDA') {
    throw conflict('El comprobante ya tiene CAE: no hace falta reintentar');
  }
  if (comprobante.estado === 'ANULADA') {
    throw conflict('El comprobante esta anulado y no se puede reintentar');
  }

  await prisma.invoice.update({
    where: { id: comprobante.id },
    data: { estado: 'BORRADOR', resultado: null, arcaErrors: null },
  });

  return autorizarComprobante(comprobante.id, studioId, userId, ip);
}

/* -------------------------------------------------------------------------- */
/* Nota de credito                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Emite la nota de credito asociada a un comprobante. Si no se mandan items,
 * se replica el original completo (nota de credito total).
 */
export async function createCreditNote(
  invoiceId: string,
  input: CreditNoteInput,
  studioId: string,
  userId: string,
  ip: string | null = null,
): Promise<ComprobanteSerializado> {
  const original = await cargarComprobante(invoiceId, studioId);

  if (original.estado !== 'EMITIDA' || !original.cae || original.cbteNro === null) {
    throw conflict(
      'Solo se puede emitir una nota de credito sobre un comprobante emitido con CAE',
    );
  }
  if (esNotaDeCredito(original.cbteTipo)) {
    throw conflict('No se puede emitir una nota de credito de otra nota de credito');
  }

  const cbteTipoNC = notaDeCreditoPara(original.cbteTipo);

  const items =
    input.items ??
    original.items.map((item) => {
      // Se reconstruye el precio unitario NETO a partir del importe ya
      // persistido, para que la NC replique exactamente al original aunque el
      // precio original se hubiera cargado con IVA incluido.
      const factor = item.cantidad * (1 - item.bonificacion / 100);
      const precioUnitario = factor > 0 ? item.subtotalNeto / factor : item.precioUnitario;
      return {
        productId: item.productId,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precioUnitario,
        bonificacion: item.bonificacion,
        ivaId: item.ivaId,
        precioConIva: false,
      };
    });

  const tributos =
    input.tributos ??
    original.tributos.map((t) => ({
      tributoId: t.tributoId,
      descripcion: t.descripcion,
      baseImp: t.baseImp,
      alicuota: t.alicuota,
    }));

  const cbtesAsoc: ArcaCbteAsoc[] = [
    {
      Tipo: original.cbteTipo,
      PtoVta: original.ptoVta,
      Nro: original.cbteNro,
      Cuit: soloDigitos(original.company.cuit),
      CbteFch: aFechaArca(original.fechaCbte),
    },
  ];

  const motivo = input.motivo?.trim();
  const referencia = `NC por ${descripcionComprobante(original.cbteTipo)} ${formatearNumeroComprobante(
    original.ptoVta,
    original.cbteNro,
  )}`;

  const cuerpo: InvoiceInput = {
    companyId: original.companyId,
    ptoVta: original.ptoVta,
    cbteTipo: cbteTipoNC,
    concepto: original.concepto,
    customerId: original.customerId,
    docTipo: original.docTipo,
    docNro: original.docNro,
    receptorRazonSocial: original.receptorRazonSocial,
    receptorDomicilio: original.receptorDomicilio,
    condicionIvaReceptorId: original.condicionIvaReceptorId,
    fechaCbte: input.fechaCbte ?? aFechaIso(hoyUtc()),
    fchServDesde: original.fchServDesde ? aFechaIso(original.fchServDesde) : null,
    fchServHasta: original.fchServHasta ? aFechaIso(original.fchServHasta) : null,
    fchVtoPago: original.fchVtoPago ? aFechaIso(original.fchVtoPago) : null,
    monId: original.monId,
    monCotiz: original.monCotiz,
    items,
    tributos,
    observaciones: motivo ? `${referencia}. Motivo: ${motivo}` : referencia,
  };

  return emitInvoice(cuerpo, studioId, userId, {
    cbteTipoForzado: cbteTipoNC,
    cbtesAsoc,
    ip,
  });
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                   */
/* -------------------------------------------------------------------------- */

export interface ListadoComprobantes {
  items: ComprobanteSerializado[];
  total: number;
  page: number;
  pageSize: number;
  /** Totales del filtro aplicado (no solo de la pagina). */
  resumen: { impNeto: number; impIVA: number; impTotal: number };
}

export async function listInvoices(
  query: ListInvoicesQuery,
  studioId: string,
): Promise<ListadoComprobantes> {
  const where: Prisma.InvoiceWhereInput = { company: { studioId } };

  if (query.companyId) {
    where.companyId = query.companyId;
    // Doble chequeo de tenant: la empresa tiene que ser del estudio.
    const existe = await prisma.company.count({ where: { id: query.companyId, studioId } });
    if (existe === 0) throw notFound('No se encontro la empresa solicitada');
  }
  if (query.estado) where.estado = query.estado;
  if (query.cbteTipo) where.cbteTipo = query.cbteTipo;

  if (query.desde || query.hasta) {
    const rango: Prisma.DateTimeFilter = {};
    if (query.desde) rango.gte = parsearFechaIso(query.desde);
    if (query.hasta) rango.lte = parsearFechaIso(query.hasta);
    where.fechaCbte = rango;
  }

  if (query.search) {
    const termino = query.search.trim();
    const numerico = Number(soloDigitos(termino));
    where.OR = [
      { receptorRazonSocial: { contains: termino } },
      { docNro: { contains: soloDigitos(termino) || termino } },
      { cae: { contains: termino } },
      { customer: { razonSocial: { contains: termino } } },
      ...(Number.isFinite(numerico) && numerico > 0 ? [{ cbteNro: numerico }] : []),
    ];
  }

  const [total, filas, agregado] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: includeComprobante,
      orderBy: [{ fechaCbte: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.invoice.aggregate({
      where,
      _sum: { impNeto: true, impIVA: true, impTotal: true },
    }),
  ]);

  return {
    items: filas.map(serializarComprobante),
    total,
    page: query.page,
    pageSize: query.pageSize,
    resumen: {
      impNeto: agregado._sum.impNeto ?? 0,
      impIVA: agregado._sum.impIVA ?? 0,
      impTotal: agregado._sum.impTotal ?? 0,
    },
  };
}

export async function getInvoice(
  invoiceId: string,
  studioId: string,
): Promise<ComprobanteSerializado> {
  return serializarComprobante(await cargarComprobante(invoiceId, studioId));
}

/** Comprobante crudo con relaciones. Filtra SIEMPRE por estudio. */
export async function cargarComprobante(
  invoiceId: string,
  studioId: string,
): Promise<InvoiceCompleto> {
  const comprobante = await prisma.invoice.findFirst({
    where: { id: invoiceId, company: { studioId } },
    include: includeComprobante,
  });
  if (!comprobante) throw notFound('No se encontro el comprobante solicitado');
  return comprobante;
}

export interface LogArca {
  invoiceId: string;
  estado: string;
  resultado: string | null;
  request: string | null;
  response: string | null;
  observaciones: DetalleError[];
  errores: DetalleError[];
  emitidaAt: string | null;
}

export async function getArcaLog(invoiceId: string, studioId: string): Promise<LogArca> {
  const comprobante = await cargarComprobante(invoiceId, studioId);
  return {
    invoiceId: comprobante.id,
    estado: comprobante.estado,
    resultado: comprobante.resultado,
    request: comprobante.arcaRequest,
    response: comprobante.arcaResponse,
    observaciones: parsearJson<DetalleError[]>(comprobante.arcaObs, []),
    errores: parsearJson<DetalleError[]>(comprobante.arcaErrors, []),
    emitidaAt: comprobante.emitidaAt?.toISOString() ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Serializacion                                                               */
/* -------------------------------------------------------------------------- */

export function serializarCliente(cliente: Customer): ClienteSerializado {
  return {
    id: cliente.id,
    razonSocial: cliente.razonSocial,
    docTipo: cliente.docTipo,
    docNro: cliente.docNro,
    condicionIvaReceptorId: cliente.condicionIvaReceptorId,
    email: cliente.email,
    telefono: cliente.telefono,
    domicilio: cliente.domicilio,
    localidad: cliente.localidad,
    provincia: cliente.provincia,
    notas: cliente.notas,
    companyId: cliente.companyId,
    active: cliente.active,
  };
}

export function serializarComprobante(inv: InvoiceCompleto): ComprobanteSerializado {
  const alicuotaDe = (ivaId: number): number => {
    const tabla: Record<number, number> = { 3: 0, 9: 2.5, 8: 5, 4: 10.5, 5: 21, 6: 27 };
    return tabla[ivaId] ?? 0;
  };

  return {
    id: inv.id,
    estado: inv.estado,
    cae: inv.cae,
    caeVto: inv.caeVto ? aFechaIso(inv.caeVto) : null,
    cbteNro: inv.cbteNro,
    ptoVta: inv.ptoVta,
    cbteTipo: inv.cbteTipo,
    numeroFormateado: formatearNumeroComprobante(inv.ptoVta, inv.cbteNro),
    letra: letraDeComprobante(inv.cbteTipo),
    descripcionComprobante: descripcionComprobante(inv.cbteTipo),
    concepto: inv.concepto,
    docTipo: inv.docTipo,
    docNro: inv.docNro,
    receptorRazonSocial: inv.receptorRazonSocial,
    receptorDomicilio: inv.receptorDomicilio,
    condicionIvaReceptorId: inv.condicionIvaReceptorId,
    fechaCbte: aFechaIso(inv.fechaCbte),
    fchServDesde: inv.fchServDesde ? aFechaIso(inv.fchServDesde) : null,
    fchServHasta: inv.fchServHasta ? aFechaIso(inv.fchServHasta) : null,
    fchVtoPago: inv.fchVtoPago ? aFechaIso(inv.fchVtoPago) : null,
    monId: inv.monId,
    monCotiz: inv.monCotiz,
    impNeto: inv.impNeto,
    impIVA: inv.impIVA,
    impTotConc: inv.impTotConc,
    impOpEx: inv.impOpEx,
    impTrib: inv.impTrib,
    impTotal: inv.impTotal,
    qrUrl: inv.qrPayload,
    pdfUrl: `/api/invoices/${inv.id}/pdf`,
    resultado: inv.resultado,
    observaciones: parsearJson<DetalleError[]>(inv.arcaObs, []),
    errores: parsearJson<DetalleError[]>(inv.arcaErrors, []),
    observacionesTexto: inv.observaciones,
    cbtesAsoc: parsearJson<ArcaCbteAsoc[]>(inv.cbtesAsoc, []),
    environment: inv.environment,
    emitidaAt: inv.emitidaAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    items: inv.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      orden: item.orden,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad: item.unidad,
      precioUnitario: item.precioUnitario,
      bonificacion: item.bonificacion,
      ivaId: item.ivaId,
      alicuota: alicuotaDe(item.ivaId),
      subtotalNeto: item.subtotalNeto,
      importeIva: item.importeIva,
      subtotalConIva: item.subtotalConIva,
    })),
    tributos: inv.tributos.map((t) => ({
      id: t.id,
      tributoId: t.tributoId,
      descripcion: t.descripcion,
      baseImp: t.baseImp,
      alicuota: t.alicuota,
      importe: t.importe,
    })),
    company: serializarEmpresa(inv.company),
    customer: inv.customer ? serializarCliente(inv.customer) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

export function parsearJson<T>(valor: string | null, porDefecto: T): T {
  if (!valor) return porDefecto;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return porDefecto;
  }
}

function normalizarObs(lista: ArcaObservacion[] | undefined): DetalleError[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((o) => ({ code: Number(o.Code) || 0, msg: String(o.Msg ?? '') }));
}

async function registrarAuditoria(args: {
  userId: string | null;
  studioId: string;
  action: string;
  entityId: string;
  ip: string | null;
  detail: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: args.userId,
        studioId: args.studioId,
        action: args.action,
        entity: 'Invoice',
        entityId: args.entityId,
        detail: JSON.stringify(args.detail),
        ip: args.ip,
      },
    });
  } catch {
    // La auditoria nunca puede tumbar una emision exitosa.
  }
}

export { AppError };
