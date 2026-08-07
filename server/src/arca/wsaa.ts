/**
 * WSAA: autenticacion contra ARCA.
 *
 * El flujo es siempre el mismo:
 *   1. se arma un LoginTicketRequest (XML con uniqueId y ventana de validez),
 *   2. se firma en CMS/PKCS#7 con el certificado y la clave privada de la
 *      empresa,
 *   3. se manda en base64 a WSAA, que devuelve un Ticket de Acceso (TA) con
 *      token + sign validos por 12 horas.
 *
 * El TA se cachea en la tabla `ArcaTicket` (unique companyId+service+
 * environment). Esto NO es una optimizacion opcional: ARCA bloquea al CUIT
 * si se piden tickets de mas ("El CEE ya posee un TA valido para el acceso al
 * WSN solicitado"), asi que siempre se reusa el vigente.
 */

import forge from 'node-forge';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import type {
  ArcaCredentials,
  ArcaEnvironment,
  ArcaTicketAccess,
} from '../domain/arca-port.js';
import { ArcaError } from './errors.js';
import { arcaLog, asString, parseXml, pick, soapCall } from './soap.js';

/** Servicio de facturacion electronica. */
export const SERVICIO_WSFE = 'wsfe';
/** Servicio del padron A5 (consulta de contribuyentes). */
export const SERVICIO_PADRON_A5 = 'ws_sr_padron_a5';

/** Duracion que se pide para el TA. ARCA no permite mas de 24 horas. */
const VALIDEZ_HORAS = 12;
/** Se pide el TA con la generacion 10 minutos atras, para tolerar desfasajes de reloj. */
const GRACIA_GENERACION_MS = 10 * 60 * 1000;
/** Margen con el que se considera "por vencer" un TA cacheado. */
export const MARGEN_RENOVACION_MS = 10 * 60 * 1000;

const NS_WSAA = 'http://wsaa.view.sua.dvadac.desarrollo.afip.gov';

// ---------------------------------------------------------------------------
// LoginTicketRequest
// ---------------------------------------------------------------------------

/** Formatea una fecha como xsd:dateTime local con offset explicito. */
function isoConOffset(fecha: Date): string {
  const pad = (n: number): string => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -fecha.getTimezoneOffset();
  const signo = offsetMin >= 0 ? '+' : '-';
  const offset = `${signo}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;
  return (
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}` +
    `T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}${offset}`
  );
}

export interface LoginTicketOptions {
  service: string;
  /** Momento de referencia (por defecto, ahora). Se inyecta en los tests. */
  ahora?: Date;
  uniqueId?: number;
}

/** Arma el XML del LoginTicketRequest que despues se firma en CMS. */
export function buildLoginTicketRequest(opts: LoginTicketOptions): string {
  const ahora = opts.ahora ?? new Date();
  const generacion = new Date(ahora.getTime() - GRACIA_GENERACION_MS);
  const expiracion = new Date(ahora.getTime() + VALIDEZ_HORAS * 60 * 60 * 1000);
  // uniqueId tiene que entrar en un unsigned int; los segundos de epoch sirven.
  const uniqueId = opts.uniqueId ?? Math.floor(ahora.getTime() / 1000) % 4294967295;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<loginTicketRequest version="1.0">\n' +
    '  <header>\n' +
    `    <uniqueId>${uniqueId}</uniqueId>\n` +
    `    <generationTime>${isoConOffset(generacion)}</generationTime>\n` +
    `    <expirationTime>${isoConOffset(expiracion)}</expirationTime>\n` +
    '  </header>\n' +
    `  <service>${opts.service}</service>\n` +
    '</loginTicketRequest>'
  );
}

/**
 * Firma el LoginTicketRequest en CMS/PKCS#7 (SignedData, contenido incluido)
 * y lo devuelve en base64, listo para mandarle a WSAA.
 */
export function signLoginTicketRequest(
  loginTicketXml: string,
  certPem: string,
  keyPem: string,
): string {
  let cert: forge.pki.Certificate;
  let key: forge.pki.rsa.PrivateKey;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch (err) {
    throw ArcaError.configuracion(
      'El certificado de la empresa no se puede leer. Volvé a subir el archivo que descargaste de ARCA.',
      [{ code: 0, msg: err instanceof Error ? err.message : String(err) }],
    );
  }
  try {
    key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  } catch (err) {
    throw ArcaError.configuracion(
      'La clave privada de la empresa no se puede leer. Tiene que ser un PEM sin contrasena.',
      [{ code: 0, msg: err instanceof Error ? err.message : String(err) }],
    );
  }

  const ahora = new Date();
  if (cert.validity.notAfter.getTime() < ahora.getTime()) {
    throw ArcaError.configuracion(
      `El certificado de ARCA vencio el ${cert.validity.notAfter.toLocaleDateString('es-AR')}. ` +
        'Generá uno nuevo desde el sitio de ARCA y volvé a subirlo.',
    );
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(loginTicketXml, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  // detached = false: el LoginTicketRequest viaja adentro del CMS.
  p7.sign({ detached: false });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

// ---------------------------------------------------------------------------
// Respuesta de WSAA
// ---------------------------------------------------------------------------

/**
 * La respuesta trae el XML del TA escapado adentro de <loginCmsReturn>.
 * Devuelve el ticket ya normalizado.
 */
export function parseLoginCmsResponse(soapXml: string): ArcaTicketAccess {
  const parsed = parseXml(soapXml);
  const retorno = asString(
    pick(parsed, 'Envelope', 'Body', 'loginCmsResponse', 'loginCmsReturn'),
  );
  if (!retorno) {
    throw ArcaError.autenticacion(
      'WSAA respondio sin el ticket de acceso. Reintentá en unos minutos.',
      [{ code: 0, msg: soapXml.slice(0, 500) }],
    );
  }
  return parseLoginTicketResponse(retorno);
}

/** Parsea el XML del TA (loginTicketResponse). */
export function parseLoginTicketResponse(taXml: string): ArcaTicketAccess {
  const ta = parseXml(taXml);
  const token = asString(pick(ta, 'loginTicketResponse', 'credentials', 'token'));
  const sign = asString(pick(ta, 'loginTicketResponse', 'credentials', 'sign'));
  const generationTime = asString(
    pick(ta, 'loginTicketResponse', 'header', 'generationTime'),
  );
  const expirationTime = asString(
    pick(ta, 'loginTicketResponse', 'header', 'expirationTime'),
  );

  if (!token || !sign) {
    throw ArcaError.autenticacion(
      'WSAA devolvio un ticket de acceso incompleto (falta token o sign).',
      [{ code: 0, msg: taXml.slice(0, 500) }],
    );
  }

  const generacion = new Date(generationTime);
  const expiracion = new Date(expirationTime);

  return {
    token,
    sign,
    generationTime: Number.isNaN(generacion.getTime()) ? new Date() : generacion,
    expirationTime: Number.isNaN(expiracion.getTime())
      ? new Date(Date.now() + VALIDEZ_HORAS * 60 * 60 * 1000)
      : expiracion,
  };
}

// ---------------------------------------------------------------------------
// Cache en base + obtencion del TA
// ---------------------------------------------------------------------------

function clave(companyId: string, service: string, environment: ArcaEnvironment): string {
  return `${companyId}|${service}|${environment}`;
}

/**
 * Pedidos en vuelo, para que dos emisiones simultaneas de la misma empresa no
 * disparen dos logins a WSAA (que es justamente lo que ARCA penaliza).
 */
const enVuelo = new Map<string, Promise<ArcaTicketAccess>>();

function vigente(ticket: { expirationTime: Date }, margenMs: number): boolean {
  return ticket.expirationTime.getTime() - margenMs > Date.now();
}

async function leerTicketCacheado(
  companyId: string,
  service: string,
  environment: ArcaEnvironment,
): Promise<ArcaTicketAccess | null> {
  try {
    const fila = await prisma.arcaTicket.findUnique({
      where: {
        companyId_service_environment: { companyId, service, environment },
      },
    });
    if (!fila) return null;
    return {
      token: fila.token,
      sign: fila.sign,
      generationTime: fila.generationTime,
      expirationTime: fila.expirationTime,
    };
  } catch (err) {
    // Si la base falla no tiene sentido tumbar la emision por el cache.
    arcaLog.warn('No se pudo leer el ticket de acceso cacheado', {
      motivo: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function guardarTicket(
  companyId: string,
  service: string,
  environment: ArcaEnvironment,
  ticket: ArcaTicketAccess,
): Promise<void> {
  try {
    await prisma.arcaTicket.upsert({
      where: {
        companyId_service_environment: { companyId, service, environment },
      },
      create: {
        companyId,
        service,
        environment,
        token: ticket.token,
        sign: ticket.sign,
        generationTime: ticket.generationTime,
        expirationTime: ticket.expirationTime,
      },
      update: {
        token: ticket.token,
        sign: ticket.sign,
        generationTime: ticket.generationTime,
        expirationTime: ticket.expirationTime,
      },
    });
  } catch (err) {
    arcaLog.warn('No se pudo guardar el ticket de acceso en cache', {
      motivo: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Llama a WSAA y devuelve el TA nuevo (sin tocar el cache). */
export async function loginWsaa(
  creds: ArcaCredentials,
  service: string,
): Promise<ArcaTicketAccess> {
  if (!creds.certPem || !creds.keyPem) {
    throw ArcaError.configuracion(
      'La empresa no tiene cargado el certificado de ARCA. Subilo desde la ficha de la empresa ' +
        'para poder facturar.',
    );
  }

  const url = config.arca.wsaa[creds.environment];
  const loginTicket = buildLoginTicketRequest({ service });
  const cms = signLoginTicketRequest(loginTicket, creds.certPem, creds.keyPem);

  const body =
    `    <wsaa:loginCms xmlns:wsaa="${NS_WSAA}">\n` +
    `      <wsaa:in0>${cms}</wsaa:in0>\n` +
    '    </wsaa:loginCms>';

  arcaLog.debug(`WSAA loginCms ${service} (${creds.environment})`, { cuit: creds.cuit });

  // Un solo reintento: si WSAA se cae, insistir de mas es contraproducente.
  const res = await soapCall({
    url,
    body,
    action: '',
    version: '1.1',
    retries: 1,
    label: `WSAA loginCms(${service})`,
  });

  const ticket = parseLoginCmsResponse(res.raw);
  arcaLog.info(
    `TA nuevo para ${service}/${creds.environment}, vence ${ticket.expirationTime.toISOString()}`,
  );
  return ticket;
}

/**
 * Devuelve un TA vigente para la empresa y el servicio, reusando el de la
 * base si todavia sirve.
 */
export async function obtenerTicketAcceso(
  creds: ArcaCredentials,
  service: string = SERVICIO_WSFE,
): Promise<ArcaTicketAccess> {
  const k = clave(creds.companyId, service, creds.environment);

  const cacheado = await leerTicketCacheado(creds.companyId, service, creds.environment);
  if (cacheado && vigente(cacheado, MARGEN_RENOVACION_MS)) {
    arcaLog.debug(`TA reusado del cache para ${service}/${creds.environment}`);
    return cacheado;
  }

  const pendiente = enVuelo.get(k);
  if (pendiente) return pendiente;

  const promesa = (async (): Promise<ArcaTicketAccess> => {
    try {
      const ticket = await loginWsaa(creds, service);
      await guardarTicket(creds.companyId, service, creds.environment, ticket);
      return ticket;
    } catch (err) {
      // "El CEE ya posee un TA valido...": ARCA todavia considera vigente el
      // ticket anterior. Si lo tenemos guardado, se reusa aunque este dentro
      // del margen de renovacion.
      if (err instanceof ArcaError && err.code === 'ARCA_AUTH_ERROR') {
        const previo = await leerTicketCacheado(
          creds.companyId,
          service,
          creds.environment,
        );
        if (previo && vigente(previo, 0)) {
          arcaLog.warn(
            `WSAA rechazo el login por TA vigente; se reusa el guardado (vence ${previo.expirationTime.toISOString()})`,
          );
          return previo;
        }
        if (/ya posee un ta/i.test(err.message) || /ya existe un ticket/i.test(err.message)) {
          throw ArcaError.autenticacion(
            'ARCA tiene un ticket de acceso vigente para este CUIT que esta app no conserva ' +
              '(por ejemplo, porque se emitio desde otro sistema). Esperá unos minutos y ' +
              'reintentá: los tickets duran 12 horas.',
            err.details,
          );
        }
      }
      throw err;
    } finally {
      enVuelo.delete(k);
    }
  })();

  enVuelo.set(k, promesa);
  return promesa;
}

/** Borra el TA cacheado (por ejemplo, si ARCA lo rechaza por invalido). */
export async function invalidarTicket(
  companyId: string,
  service: string,
  environment: ArcaEnvironment,
): Promise<void> {
  try {
    await prisma.arcaTicket.deleteMany({ where: { companyId, service, environment } });
  } catch (err) {
    arcaLog.warn('No se pudo invalidar el ticket de acceso', {
      motivo: err instanceof Error ? err.message : String(err),
    });
  }
}
