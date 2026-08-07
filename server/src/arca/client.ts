/**
 * Implementacion real del puerto `ArcaClient`: orquesta WSAA (autenticacion),
 * WSFEv1 (emision y consultas) y el padron A5.
 *
 * Responsabilidades propias de esta capa:
 *   - validar que la empresa tenga credenciales antes de salir a la red,
 *   - resolver el numero de comprobante cuando no viene dado,
 *   - renovar el ticket de acceso una sola vez si ARCA lo rechaza.
 */

import type {
  ArcaClient,
  ArcaCredentials,
  ArcaEnvironment,
  ArcaHealth,
  ArcaInvoiceRequest,
  ArcaInvoiceResponse,
  ArcaPadronData,
  ArcaPuntoVenta,
  ArcaTicketAccess,
} from '../domain/arca-port.js';
import { ArcaError } from './errors.js';
import { consultarPadronA5, normalizarCuit, validarCuit } from './padron.js';
import { arcaLog } from './soap.js';
import {
  invalidarTicket,
  obtenerTicketAcceso,
  SERVICIO_PADRON_A5,
  SERVICIO_WSFE,
} from './wsaa.js';
import {
  authDesdeTicket,
  feCAESolicitar,
  feCompConsultar,
  feCompUltimoAutorizado,
  feDummy,
  feParamGetCotizacion,
  feParamGetPtosVenta,
  type AuthWsfe,
} from './wsfev1.js';

export class RealArcaClient implements ArcaClient {
  async health(env: ArcaEnvironment): Promise<ArcaHealth> {
    return feDummy(env);
  }

  async authenticate(
    creds: ArcaCredentials,
    service: string = SERVICIO_WSFE,
  ): Promise<ArcaTicketAccess> {
    validarCredenciales(creds);
    return obtenerTicketAcceso(creds, service);
  }

  async getUltimoAutorizado(
    creds: ArcaCredentials,
    ptoVta: number,
    cbteTipo: number,
  ): Promise<number> {
    return this.conAuth(creds, SERVICIO_WSFE, (auth) =>
      feCompUltimoAutorizado(auth, creds.environment, ptoVta, cbteTipo),
    );
  }

  async solicitarCAE(
    creds: ArcaCredentials,
    req: ArcaInvoiceRequest,
  ): Promise<ArcaInvoiceResponse> {
    validarCredenciales(creds);

    let pedido = req;
    if (!pedido.CbteDesde) {
      const ultimo = await this.getUltimoAutorizado(creds, req.PtoVta, req.CbteTipo);
      const proximo = ultimo + 1;
      pedido = { ...req, CbteDesde: proximo, CbteHasta: proximo };
    } else if (!pedido.CbteHasta) {
      pedido = { ...pedido, CbteHasta: pedido.CbteDesde };
    }

    const respuesta = await this.conAuth(creds, SERVICIO_WSFE, (auth) =>
      feCAESolicitar(auth, creds.environment, pedido),
    );

    if (respuesta.resultado === 'A') {
      arcaLog.info(
        `CAE ${respuesta.cae} otorgado para ${pedido.PtoVta}-${respuesta.cbteNro} ` +
          `(tipo ${pedido.CbteTipo}, ${creds.environment})`,
      );
    } else {
      arcaLog.warn(
        `ARCA rechazo el comprobante ${pedido.PtoVta}-${respuesta.cbteNro}: ` +
          respuesta.errores.map((e) => `${e.Code} ${e.Msg}`).join(' | '),
      );
    }
    return respuesta;
  }

  async getPuntosVenta(creds: ArcaCredentials): Promise<ArcaPuntoVenta[]> {
    return this.conAuth(creds, SERVICIO_WSFE, (auth) =>
      feParamGetPtosVenta(auth, creds.environment),
    );
  }

  async getCotizacion(creds: ArcaCredentials, monId: string): Promise<number> {
    if (!monId || monId === 'PES') return 1;
    return this.conAuth(creds, SERVICIO_WSFE, (auth) =>
      feParamGetCotizacion(auth, creds.environment, monId),
    );
  }

  async consultarComprobante(
    creds: ArcaCredentials,
    ptoVta: number,
    cbteTipo: number,
    cbteNro: number,
  ): Promise<ArcaInvoiceResponse | null> {
    return this.conAuth(creds, SERVICIO_WSFE, (auth) =>
      feCompConsultar(auth, creds.environment, ptoVta, cbteTipo, cbteNro),
    );
  }

  async consultarPadron(
    creds: ArcaCredentials,
    cuit: string,
  ): Promise<ArcaPadronData | null> {
    validarCredenciales(creds);
    const limpio = normalizarCuit(cuit);
    if (!validarCuit(limpio)) {
      throw ArcaError.rechazado(
        `El CUIT ${cuit} no es valido: revisá el digito verificador antes de consultar el padron.`,
      );
    }

    const ejecutar = async (renovar: boolean): Promise<ArcaPadronData | null> => {
      if (renovar) {
        await invalidarTicket(creds.companyId, SERVICIO_PADRON_A5, creds.environment);
      }
      const ta = await obtenerTicketAcceso(creds, SERVICIO_PADRON_A5);
      return consultarPadronA5(ta, creds.cuit, limpio, creds.environment);
    };

    try {
      return await ejecutar(false);
    } catch (err) {
      if (err instanceof ArcaError && err.code === 'ARCA_AUTH_ERROR') {
        arcaLog.warn('El padron rechazo el ticket de acceso; se renueva y reintenta una vez');
        return ejecutar(true);
      }
      throw err;
    }
  }

  /**
   * Ejecuta una operacion de WSFEv1 con el ticket de acceso vigente. Si ARCA
   * lo rechaza (token vencido o invalidado del lado de ellos), lo borra del
   * cache y reintenta una unica vez con uno nuevo.
   *
   * Es seguro reintentar incluso la emision: cuando ARCA rechaza el token no
   * llega a procesar el comprobante.
   */
  private async conAuth<T>(
    creds: ArcaCredentials,
    service: string,
    operacion: (auth: AuthWsfe) => Promise<T>,
  ): Promise<T> {
    validarCredenciales(creds);

    const ta = await obtenerTicketAcceso(creds, service);
    try {
      return await operacion(authDesdeTicket(ta, creds.cuit));
    } catch (err) {
      if (!(err instanceof ArcaError) || err.code !== 'ARCA_AUTH_ERROR') throw err;

      arcaLog.warn('ARCA rechazo el ticket de acceso; se renueva y reintenta una vez');
      await invalidarTicket(creds.companyId, service, creds.environment);
      const nuevo = await obtenerTicketAcceso(creds, service);
      return operacion(authDesdeTicket(nuevo, creds.cuit));
    }
  }
}

/** Chequeos que evitan salir a la red con datos que ARCA va a rechazar seguro. */
export function validarCredenciales(creds: ArcaCredentials): void {
  if (!creds?.companyId) {
    throw ArcaError.configuracion('Falta identificar la empresa emisora');
  }
  if (!validarCuit(creds.cuit ?? '')) {
    throw ArcaError.configuracion(
      `El CUIT de la empresa (${creds.cuit ?? 'vacio'}) no es valido. Corregilo en la ficha de la empresa.`,
    );
  }
  if (creds.environment !== 'HOMO' && creds.environment !== 'PROD') {
    throw ArcaError.configuracion(
      `Ambiente de ARCA desconocido: ${String(creds.environment)}. Tiene que ser HOMO o PROD.`,
    );
  }
  if (!creds.certPem || !creds.keyPem) {
    throw ArcaError.configuracion(
      'La empresa todavia no tiene cargado el certificado de ARCA. Subilo desde la ficha de la ' +
        'empresa para poder facturar.',
    );
  }
}
