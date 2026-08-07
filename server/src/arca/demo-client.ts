/**
 * Implementacion simulada del puerto `ArcaClient`.
 *
 * Permite usar y demostrar la app de punta a punta sin certificados: emite
 * CAE plausibles, numera de forma correlativa y persistente (leyendo el
 * ultimo comprobante emitido en la base), simula la latencia de ARCA y
 * rechaza los casos que ARCA rechazaria de verdad, para poder probar tambien
 * el camino de error.
 *
 * Todo lo que devuelve esta marcado como simulado en el XML de auditoria: no
 * hay forma de confundir un comprobante demo con uno real.
 */

import { prisma } from '../lib/prisma.js';
import type {
  ArcaClient,
  ArcaCredentials,
  ArcaEnvironment,
  ArcaHealth,
  ArcaInvoiceRequest,
  ArcaInvoiceResponse,
  ArcaObservacion,
  ArcaPadronData,
  ArcaPuntoVenta,
  ArcaTicketAccess,
} from '../domain/arca-port.js';
import { requierePeriodoServicio } from '../domain/catalogs.js';
import { ArcaError } from './errors.js';
import {
  formatearCuit,
  normalizarCuit,
  tipoPersonaDeCuit,
  validarCuit,
} from './padron.js';
import { buildQrUrl } from './qr.js';
import { arcaLog, escapeXml, parseXml } from './soap.js';
import {
  authDesdeTicket,
  buildFECAESolicitarBody,
  formatFecha,
  formatImporte,
  parseFECAESolicitarResponse,
} from './wsfev1.js';

// ---------------------------------------------------------------------------
// Acceso a datos (inyectable, para poder testear sin base)
// ---------------------------------------------------------------------------

export interface ClaveComprobante {
  companyId: string;
  ptoVta: number;
  cbteTipo: number;
  environment: ArcaEnvironment;
}

export interface ComprobanteEmitido {
  cbteNro: number;
  cae: string | null;
  caeVto: Date | null;
  resultado: string | null;
}

export interface DemoStore {
  /** Ultimo numero con CAE otorgado para esa empresa/pto vta/tipo/ambiente. */
  ultimoAutorizado(clave: ClaveComprobante): Promise<number>;
  /** Comprobante ya emitido, para FECompConsultar. */
  buscarComprobante(
    clave: ClaveComprobante,
    cbteNro: number,
  ): Promise<ComprobanteEmitido | null>;
}

/** Store real: lee la tabla Invoice con Prisma. */
export const prismaDemoStore: DemoStore = {
  async ultimoAutorizado(clave) {
    try {
      const agregado = await prisma.invoice.aggregate({
        _max: { cbteNro: true },
        where: {
          companyId: clave.companyId,
          ptoVta: clave.ptoVta,
          cbteTipo: clave.cbteTipo,
          environment: clave.environment,
          // Solo los que efectivamente obtuvieron CAE consumen numeracion:
          // un comprobante rechazado no gasta el numero (igual que en ARCA).
          cae: { not: null },
        },
      });
      return agregado._max.cbteNro ?? 0;
    } catch (err) {
      throw ArcaError.noDisponible(
        'No se pudo determinar el proximo numero de comprobante (modo demo)',
        [],
        err,
      );
    }
  },

  async buscarComprobante(clave, cbteNro) {
    try {
      const fila = await prisma.invoice.findFirst({
        where: {
          companyId: clave.companyId,
          ptoVta: clave.ptoVta,
          cbteTipo: clave.cbteTipo,
          environment: clave.environment,
          cbteNro,
        },
        select: { cbteNro: true, cae: true, caeVto: true, resultado: true },
      });
      if (!fila || fila.cbteNro === null) return null;
      return {
        cbteNro: fila.cbteNro,
        cae: fila.cae,
        caeVto: fila.caeVto,
        resultado: fila.resultado,
      };
    } catch (err) {
      throw ArcaError.noDisponible(
        'No se pudo consultar el comprobante (modo demo)',
        [],
        err,
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Utilidades de la simulacion
// ---------------------------------------------------------------------------

export interface DemoOptions {
  store?: DemoStore;
  /** Latencia simulada en ms. Por defecto entre 300 y 600. Poner 0 en los tests. */
  latenciaMs?: number | [number, number];
}

/** Dias de validez que ARCA le da al CAE. */
const DIAS_VENCIMIENTO_CAE = 10;

/**
 * Importe a partir del cual ARCA exige identificar al comprador en los
 * comprobantes clase B (RG 4444 y actualizaciones). Se usa solo para generar
 * una observacion realista.
 */
const TOPE_CONSUMIDOR_FINAL = 417000;

const esperar = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/** Hash estable (FNV-1a) para derivar datos verosimiles y reproducibles del CUIT. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** CAE de 14 digitos, con la forma que tienen los reales (arrancan en 7). */
function generarCae(cbteNro: number): string {
  const aleatorio = Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, '0');
  const semilla = `7${(Date.now() % 10000).toString().padStart(4, '0')}${aleatorio}`;
  return `${semilla}${cbteNro}`.slice(0, 14).padEnd(14, '0');
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 24 * 60 * 60 * 1000);
}

function bloqueObs(nombre: string, item: string, obs: ArcaObservacion[]): string {
  if (obs.length === 0) return '';
  const items = obs
    .map(
      (o) =>
        `<${item}><Code>${o.Code}</Code><Msg>${escapeXml(o.Msg)}</Msg></${item}>`,
    )
    .join('');
  return `<${nombre}>${items}</${nombre}>`;
}

// ---------------------------------------------------------------------------
// Cliente demo
// ---------------------------------------------------------------------------

export class DemoArcaClient implements ArcaClient {
  private readonly store: DemoStore;
  private readonly latencia: [number, number];
  /** Tickets simulados, por empresa+servicio+ambiente. */
  private readonly tickets = new Map<string, ArcaTicketAccess>();
  /** Cola por punto de venta para que dos emisiones simultaneas no repitan numero. */
  private readonly colas = new Map<string, Promise<unknown>>();

  constructor(opciones: DemoOptions = {}) {
    this.store = opciones.store ?? prismaDemoStore;
    const lat = opciones.latenciaMs ?? [300, 600];
    this.latencia = typeof lat === 'number' ? [lat, lat] : lat;
  }

  private async latir(): Promise<void> {
    const [min, max] = this.latencia;
    await esperar(min + Math.random() * Math.max(0, max - min));
  }

  /** Serializa las operaciones que numeran comprobantes. */
  private async enCola<T>(clave: string, fn: () => Promise<T>): Promise<T> {
    const anterior = this.colas.get(clave) ?? Promise.resolve();
    const propia = anterior.then(fn, fn);
    this.colas.set(
      clave,
      propia.then(
        () => undefined,
        () => undefined,
      ),
    );
    return propia;
  }

  async health(env: ArcaEnvironment): Promise<ArcaHealth> {
    await this.latir();
    arcaLog.debug(`[demo] FEDummy ${env}`);
    return { appServer: 'OK', dbServer: 'OK', authServer: 'OK', ok: true };
  }

  async authenticate(
    creds: ArcaCredentials,
    service = 'wsfe',
  ): Promise<ArcaTicketAccess> {
    await this.latir();
    const clave = `${creds.companyId}|${service}|${creds.environment}`;
    const cacheado = this.tickets.get(clave);
    if (cacheado && cacheado.expirationTime.getTime() - 10 * 60 * 1000 > Date.now()) {
      return cacheado;
    }

    const ahora = new Date();
    const ticket: ArcaTicketAccess = {
      token: Buffer.from(`demo-token:${clave}:${ahora.toISOString()}`).toString('base64'),
      sign: Buffer.from(`demo-sign:${hash(clave)}`).toString('base64'),
      generationTime: new Date(ahora.getTime() - 10 * 60 * 1000),
      expirationTime: new Date(ahora.getTime() + 12 * 60 * 60 * 1000),
    };
    this.tickets.set(clave, ticket);
    return ticket;
  }

  async getUltimoAutorizado(
    creds: ArcaCredentials,
    ptoVta: number,
    cbteTipo: number,
  ): Promise<number> {
    await this.latir();
    return this.store.ultimoAutorizado({
      companyId: creds.companyId,
      ptoVta,
      cbteTipo,
      environment: creds.environment,
    });
  }

  async solicitarCAE(
    creds: ArcaCredentials,
    req: ArcaInvoiceRequest,
  ): Promise<ArcaInvoiceResponse> {
    const clave: ClaveComprobante = {
      companyId: creds.companyId,
      ptoVta: req.PtoVta,
      cbteTipo: req.CbteTipo,
      environment: creds.environment,
    };
    const claveCola = `${clave.companyId}|${clave.ptoVta}|${clave.cbteTipo}|${clave.environment}`;
    return this.enCola(claveCola, () => this.emitir(creds, req, clave));
  }

  private async emitir(
    creds: ArcaCredentials,
    req: ArcaInvoiceRequest,
    clave: ClaveComprobante,
  ): Promise<ArcaInvoiceResponse> {
    await this.latir();

    const ultimo = await this.store.ultimoAutorizado(clave);
    const proximo = ultimo + 1;
    const cbteNro = req.CbteDesde ?? proximo;

    const pedido: ArcaInvoiceRequest = {
      ...req,
      CbteDesde: cbteNro,
      CbteHasta: req.CbteHasta ?? cbteNro,
    };

    const ta = await this.authenticate(creds);
    const rawRequest = buildFECAESolicitarBody(authDesdeTicket(ta, creds.cuit), pedido)
      // El request se guarda sin credenciales, igual que en el cliente real.
      .replace(/(<Token>)[\s\S]*?(<\/Token>)/, '$1***$2')
      .replace(/(<Sign>)[\s\S]*?(<\/Sign>)/, '$1***$2');

    const errores = this.validarComoArca(pedido, cbteNro, proximo);
    const observaciones = errores.length === 0 ? this.observarComoArca(pedido) : [];

    const aprobado = errores.length === 0;
    const fechaProceso = new Date();
    const cae = aprobado ? generarCae(cbteNro) : '';
    const caeVto = aprobado ? sumarDias(fechaProceso, DIAS_VENCIMIENTO_CAE) : null;

    const qrUrl = aprobado
      ? buildQrUrl({
          fecha: pedido.CbteFch,
          cuit: creds.cuit,
          ptoVta: pedido.PtoVta,
          tipoCmp: pedido.CbteTipo,
          nroCmp: cbteNro,
          importe: pedido.ImpTotal,
          moneda: pedido.MonId,
          ctz: pedido.MonCotiz,
          tipoDocRec: pedido.DocTipo,
          nroDocRec: pedido.DocNro,
          tipoCodAut: 'E',
          codAut: cae,
        })
      : '';

    const rawResponse = this.armarRespuestaXml({
      creds,
      pedido,
      cbteNro,
      cae,
      caeVto,
      fechaProceso,
      errores,
      observaciones,
      qrUrl,
    });

    // Se reusa el parser real: la respuesta simulada pasa por el mismo camino
    // que la de ARCA, asi el modo demo ejercita el codigo de produccion.
    const respuesta = parseFECAESolicitarResponse(
      parseXml(rawResponse),
      rawResponse,
      rawRequest,
      cbteNro,
    );

    arcaLog.info(
      `[demo] ${aprobado ? `CAE ${respuesta.cae} otorgado` : 'comprobante rechazado'} ` +
        `para ${pedido.PtoVta}-${cbteNro} (tipo ${pedido.CbteTipo})`,
    );
    return respuesta;
  }

  /** Reproduce los rechazos mas comunes de ARCA. */
  private validarComoArca(
    req: ArcaInvoiceRequest,
    cbteNro: number,
    proximo: number,
  ): ArcaObservacion[] {
    const errores: ArcaObservacion[] = [];

    if (req.DocTipo === 80 && !validarCuit(String(req.DocNro))) {
      errores.push({
        Code: 10015,
        Msg:
          `El campo DocNro (${req.DocNro}) no es un CUIT valido: el digito verificador no ` +
          'corresponde. Verifique el numero del receptor.',
      });
    }

    if (cbteNro !== proximo) {
      errores.push({
        Code: 10016,
        Msg:
          `El numero de comprobante ${cbteNro} no se corresponde con el proximo a autorizar ` +
          `(${proximo}). Los comprobantes deben ser correlativos.`,
      });
    }

    if (requierePeriodoServicio(req.Concepto) && !req.FchServDesde) {
      errores.push({
        Code: 10041,
        Msg: 'Para el concepto informado son obligatorios los campos FchServDesde y FchServHasta.',
      });
    }

    const suma =
      Number(req.ImpNeto ?? 0) +
      Number(req.ImpIVA ?? 0) +
      Number(req.ImpTotConc ?? 0) +
      Number(req.ImpOpEx ?? 0) +
      Number(req.ImpTrib ?? 0);
    if (Math.abs(suma - Number(req.ImpTotal ?? 0)) > 0.01) {
      errores.push({
        Code: 10013,
        Msg:
          `El campo ImpTotal (${formatImporte(req.ImpTotal ?? 0)}) no coincide con la suma de ` +
          `ImpNeto + ImpIVA + ImpTotConc + ImpOpEx + ImpTrib (${formatImporte(suma)}).`,
      });
    }

    return errores;
  }

  /** Observaciones que ARCA suele devolver sin impedir el CAE. */
  private observarComoArca(req: ArcaInvoiceRequest): ArcaObservacion[] {
    const obs: ArcaObservacion[] = [];
    if (req.DocTipo === 99 && Number(req.ImpTotal) >= TOPE_CONSUMIDOR_FINAL) {
      obs.push({
        Code: 10217,
        Msg:
          'Para comprobantes que superan el importe minimo se debe identificar al comprador ' +
          '(tipo y numero de documento).',
      });
    }
    return obs;
  }

  private armarRespuestaXml(datos: {
    creds: ArcaCredentials;
    pedido: ArcaInvoiceRequest;
    cbteNro: number;
    cae: string;
    caeVto: Date | null;
    fechaProceso: Date;
    errores: ArcaObservacion[];
    observaciones: ArcaObservacion[];
    qrUrl: string;
  }): string {
    const { pedido, cbteNro } = datos;
    const resultado = datos.errores.length === 0 ? 'A' : 'R';
    const fchProceso =
      formatFecha(datos.fechaProceso) +
      String(datos.fechaProceso.getUTCHours()).padStart(2, '0') +
      String(datos.fechaProceso.getUTCMinutes()).padStart(2, '0') +
      String(datos.fechaProceso.getUTCSeconds()).padStart(2, '0');

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<!-- Respuesta SIMULADA (modo demo, ARCA_DEMO_MODE=true). No tiene validez fiscal. -->\n` +
      (datos.qrUrl ? `<!-- QR: ${datos.qrUrl} -->\n` : '') +
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n' +
      '  <soap:Body>\n' +
      '    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">\n' +
      '      <FECAESolicitarResult>\n' +
      '        <FeCabResp>\n' +
      `          <Cuit>${normalizarCuit(datos.creds.cuit)}</Cuit>\n` +
      `          <PtoVta>${pedido.PtoVta}</PtoVta>\n` +
      `          <CbteTipo>${pedido.CbteTipo}</CbteTipo>\n` +
      `          <FchProceso>${fchProceso}</FchProceso>\n` +
      '          <CantReg>1</CantReg>\n' +
      `          <Resultado>${resultado}</Resultado>\n` +
      '          <Reproceso>N</Reproceso>\n' +
      '        </FeCabResp>\n' +
      '        <FeDetResp>\n' +
      '          <FECAEDetResponse>\n' +
      `            <Concepto>${pedido.Concepto}</Concepto>\n` +
      `            <DocTipo>${pedido.DocTipo}</DocTipo>\n` +
      `            <DocNro>${pedido.DocNro}</DocNro>\n` +
      `            <CbteDesde>${cbteNro}</CbteDesde>\n` +
      `            <CbteHasta>${cbteNro}</CbteHasta>\n` +
      `            <CbteFch>${formatFecha(pedido.CbteFch)}</CbteFch>\n` +
      `            <Resultado>${resultado}</Resultado>\n` +
      (datos.observaciones.length > 0
        ? `            ${bloqueObs('Observaciones', 'Obs', datos.observaciones)}\n`
        : '') +
      (datos.cae ? `            <CAE>${datos.cae}</CAE>\n` : '') +
      (datos.caeVto ? `            <CAEFchVto>${formatFecha(datos.caeVto)}</CAEFchVto>\n` : '') +
      '          </FECAEDetResponse>\n' +
      '        </FeDetResp>\n' +
      (datos.errores.length > 0
        ? `        ${bloqueObs('Errors', 'Err', datos.errores)}\n`
        : '') +
      '        <Events/>\n' +
      '      </FECAESolicitarResult>\n' +
      '    </FECAESolicitarResponse>\n' +
      '  </soap:Body>\n' +
      '</soap:Envelope>'
    );
  }

  async getPuntosVenta(creds: ArcaCredentials): Promise<ArcaPuntoVenta[]> {
    await this.latir();
    return [
      { Nro: 1, EmisionTipo: 'CAE', Bloqueado: false, FchBaja: null },
      { Nro: 2, EmisionTipo: 'CAE', Bloqueado: false, FchBaja: null },
      { Nro: 3, EmisionTipo: 'CAE', Bloqueado: true, FchBaja: null },
    ];
  }

  async getCotizacion(_creds: ArcaCredentials, monId: string): Promise<number> {
    await this.latir();
    const tabla: Record<string, number> = {
      PES: 1,
      DOL: 1385.5,
      '060': 1502.75, // Euro
      '012': 254.3, // Real
      '021': 1.05, // Libra
    };
    const cotizacion = tabla[monId];
    if (cotizacion === undefined) {
      throw ArcaError.rechazado(
        `No hay cotizacion disponible para la moneda ${monId} (modo demo). ` +
          'Cargala manualmente en el comprobante.',
      );
    }
    return cotizacion;
  }

  async consultarComprobante(
    creds: ArcaCredentials,
    ptoVta: number,
    cbteTipo: number,
    cbteNro: number,
  ): Promise<ArcaInvoiceResponse | null> {
    await this.latir();
    const comprobante = await this.store.buscarComprobante(
      {
        companyId: creds.companyId,
        ptoVta,
        cbteTipo,
        environment: creds.environment,
      },
      cbteNro,
    );
    if (!comprobante) return null;

    const resultado: 'A' | 'R' | 'P' = comprobante.cae ? 'A' : 'R';
    return {
      resultado,
      cae: comprobante.cae,
      caeVencimiento: comprobante.caeVto,
      cbteNro: comprobante.cbteNro,
      observaciones: [],
      errores: [],
      eventos: [],
      rawRequest: `<!-- Consulta simulada (modo demo) de ${ptoVta}-${cbteNro} tipo ${cbteTipo} -->`,
      rawResponse: `<!-- Respuesta simulada (modo demo): resultado ${resultado} -->`,
    };
  }

  async consultarPadron(
    _creds: ArcaCredentials,
    cuit: string,
  ): Promise<ArcaPadronData | null> {
    await this.latir();
    const limpio = normalizarCuit(cuit);
    if (!validarCuit(limpio)) return null;
    return padronSimulado(limpio);
  }
}

// ---------------------------------------------------------------------------
// Padron simulado
// ---------------------------------------------------------------------------

const RUBROS = [
  'DISTRIBUIDORA',
  'CONSTRUCTORA',
  'TRANSPORTES',
  'SERVICIOS INTEGRALES',
  'AGROPECUARIA',
  'TECNOLOGIA',
  'LOGISTICA',
  'ALIMENTOS',
];
const NOMBRES_FANTASIA = [
  'SAN MARTIN',
  'DEL PLATA',
  'BELGRANO',
  'LOS ANDES',
  'RIO PARANA',
  'PATAGONIA',
  'CENTRAL',
  'LA PAMPA',
];
const FORMAS = ['S.A.', 'S.R.L.', 'S.A.S.'];
const APELLIDOS = [
  'GONZALEZ',
  'RODRIGUEZ',
  'FERNANDEZ',
  'LOPEZ',
  'MARTINEZ',
  'PEREZ',
  'GOMEZ',
  'SOSA',
];
const NOMBRES = [
  'MARIA LAURA',
  'JUAN CARLOS',
  'ANA BELEN',
  'DIEGO ALBERTO',
  'SOFIA',
  'MARTIN',
  'VALERIA',
  'GUSTAVO',
];
const CALLES = [
  'AV. CORRIENTES',
  'SAN MARTIN',
  'BELGRANO',
  'AV. RIVADAVIA',
  'MITRE',
  'SARMIENTO',
  'AV. SANTA FE',
  'ALSINA',
];
const LOCALIDADES: Array<[string, string, string]> = [
  ['CIUDAD AUTONOMA DE BUENOS AIRES', 'CIUDAD AUTONOMA DE BUENOS AIRES', 'C1043'],
  ['ROSARIO', 'SANTA FE', 'S2000'],
  ['CORDOBA', 'CORDOBA', 'X5000'],
  ['LA PLATA', 'BUENOS AIRES', 'B1900'],
  ['MENDOZA', 'MENDOZA', 'M5500'],
  ['SAN MIGUEL DE TUCUMAN', 'TUCUMAN', 'T4000'],
];

/** Datos verosimiles y estables derivados del CUIT. */
export function padronSimulado(cuit: string): ArcaPadronData {
  const limpio = normalizarCuit(cuit);
  const h = hash(limpio);
  const tipoPersona = tipoPersonaDeCuit(limpio);
  const localidad = LOCALIDADES[h % LOCALIDADES.length] as [string, string, string];

  const razonSocial =
    tipoPersona === 'JURIDICA'
      ? `${RUBROS[h % RUBROS.length]} ${NOMBRES_FANTASIA[(h >> 3) % NOMBRES_FANTASIA.length]} ${
          FORMAS[(h >> 6) % FORMAS.length]
        }`
      : `${APELLIDOS[h % APELLIDOS.length]}, ${NOMBRES[(h >> 3) % NOMBRES.length]}`;

  // Las juridicas se simulan responsables inscriptas; en las fisicas se
  // alterna entre monotributo, inscripto y consumidor final.
  let condicionIvaReceptorId: number;
  let esMonotributista = false;
  let impuestos: string[];

  if (tipoPersona === 'JURIDICA') {
    condicionIvaReceptorId = 1;
    impuestos = ['IVA', 'GANANCIAS SOCIEDADES'];
  } else {
    const variante = (h >> 9) % 3;
    if (variante === 0) {
      condicionIvaReceptorId = 6;
      esMonotributista = true;
      impuestos = ['REGIMEN SIMPLIFICADO (MONOTRIBUTO)'];
    } else if (variante === 1) {
      condicionIvaReceptorId = 1;
      impuestos = ['IVA', 'GANANCIAS PERSONAS FISICAS'];
    } else {
      condicionIvaReceptorId = 5;
      impuestos = [];
    }
  }

  return {
    cuit: limpio,
    razonSocial,
    tipoPersona,
    estadoClave: 'ACTIVO',
    domicilio: `${CALLES[(h >> 12) % CALLES.length]} ${(h % 4000) + 100}`,
    localidad: localidad[0],
    provincia: localidad[1],
    codPostal: localidad[2],
    condicionIvaReceptorId,
    esMonotributista,
    impuestos,
  };
}

/** Ayuda para mostrar el CUIT formateado en los datos simulados. */
export { formatearCuit };
