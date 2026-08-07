/**
 * Fabrica del cliente de ARCA.
 *
 * El resto de la app (rutas y servicios) solo importa desde aca: nunca habla
 * directo con wsaa/wsfev1. Segun `ARCA_DEMO_MODE` devuelve la implementacion
 * simulada o la real, siempre detras de la misma interfaz `ArcaClient`.
 */

import { config } from '../config.js';
import type { ArcaClient } from '../domain/arca-port.js';
import { RealArcaClient } from './client.js';
import { DemoArcaClient } from './demo-client.js';
import { arcaLog } from './soap.js';

let instancia: ArcaClient | null = null;

/** Cliente de ARCA a usar en toda la app (singleton). */
export function getArcaClient(): ArcaClient {
  if (instancia) return instancia;

  if (config.demoMode) {
    arcaLog.info(
      'Modo DEMO activo: los comprobantes se simulan y NO tienen validez fiscal. ' +
        'Poné ARCA_DEMO_MODE=false y cargá los certificados para emitir de verdad.',
    );
    instancia = new DemoArcaClient();
  } else {
    arcaLog.info('Modo REAL: se emite contra los web services de ARCA');
    instancia = new RealArcaClient();
  }
  return instancia;
}

/** true si la integracion esta simulada. */
export function isDemoMode(): boolean {
  return config.demoMode;
}

/**
 * Reemplaza el singleton. Solo para tests: en produccion la seleccion la hace
 * la configuracion.
 */
export function setArcaClient(cliente: ArcaClient | null): void {
  instancia = cliente;
}

export { ArcaError, esArcaError, mapSoapFault } from './errors.js';
export type { ArcaErrorCode, ArcaErrorDetail } from './errors.js';
export { buildQrPayload, buildQrUrl, parseQrUrl, renderQrPng } from './qr.js';
export type { QrInput, QrPayload } from './qr.js';
export {
  formatearCuit,
  inferirCondicionIva,
  normalizarCuit,
  tipoPersonaDeCuit,
  validarCuit,
} from './padron.js';
export { SERVICIO_PADRON_A5, SERVICIO_WSFE } from './wsaa.js';
export { DemoArcaClient } from './demo-client.js';
export { RealArcaClient } from './client.js';
