/**
 * WSFEv1: facturacion electronica.
 *
 * Reglas que hay que respetar si o si (son la causa del 90% de los rechazos):
 *   - el orden de los tags del FeCAEReq es fijo, ARCA valida contra el XSD;
 *   - los tags opcionales vacios se omiten, no se mandan vacios;
 *   - los importes van con punto decimal y exactamente 2 decimales;
 *   - las fechas van como yyyymmdd;
 *   - todo el texto libre (descripciones, razon social) se escapa.
 */

import { config } from '../config.js';
import type {
  ArcaEnvironment,
  ArcaHealth,
  ArcaInvoiceRequest,
  ArcaInvoiceResponse,
  ArcaObservacion,
  ArcaPuntoVenta,
  ArcaTicketAccess,
} from '../domain/arca-port.js';
import { requierePeriodoServicio } from '../domain/catalogs.js';
import { ArcaError, type ArcaErrorDetail } from './errors.js';
import {
  asArray,
  asBoolSN,
  asNumber,
  asString,
  escapeXml,
  maskAuth,
  parseFechaArca,
  pick,
  soapCall,
  tag,
  type SoapNode,
} from './soap.js';

const NS_FEV1 = 'http://ar.gov.afip.dif.FEV1/';

/** Credenciales ya resueltas para llamar a WSFEv1. */
export interface AuthWsfe {
  token: string;
  sign: string;
  /** CUIT del emisor, solo digitos. */
  cuit: string;
}

export function authDesdeTicket(ta: ArcaTicketAccess, cuit: string): AuthWsfe {
  return { token: ta.token, sign: ta.sign, cuit: soloDigitos(cuit) };
}

const soloDigitos = (v: string | number): string => String(v).replace(/\D/g, '');

/** Importe con punto decimal y 2 decimales, como lo espera ARCA. */
export function formatImporte(valor: number, campo = 'importe'): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) {
    throw ArcaError.rechazado(`El campo ${campo} no es un numero valido: ${String(valor)}`);
  }
  const redondeado = Math.round((n + Number.EPSILON) * 100) / 100;
  return (redondeado === 0 ? 0 : redondeado).toFixed(2);
}

/** Fecha yyyymmdd: acepta Date, "yyyy-mm-dd" o "yyyymmdd". */
export function formatFecha(valor: Date | string, campo = 'fecha'): string {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw ArcaError.rechazado(`El campo ${campo} tiene una fecha invalida`);
    }
    const anio = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(valor.getUTCDate()).padStart(2, '0');
    return `${anio}${mes}${dia}`;
  }
  const limpio = String(valor).trim().replace(/-/g, '').slice(0, 8);
  if (!/^\d{8}$/.test(limpio)) {
    throw ArcaError.rechazado(
      `El campo ${campo} debe tener formato yyyymmdd y llego "${String(valor)}"`,
    );
  }
  return limpio;
}

// ---------------------------------------------------------------------------
// Armado del request
// ---------------------------------------------------------------------------

function bloqueAuth(auth: AuthWsfe): string {
  return (
    '      <Auth>\n' +
    `        <Token>${escapeXml(auth.token)}</Token>\n` +
    `        <Sign>${escapeXml(auth.sign)}</Sign>\n` +
    `        <Cuit>${soloDigitos(auth.cuit)}</Cuit>\n` +
    '      </Auth>'
  );
}

function operacion(nombre: string, contenido: string): string {
  return `    <${nombre} xmlns="${NS_FEV1}">\n${contenido}\n    </${nombre}>`;
}

/**
 * Arma el <FECAEDetRequest> respetando el orden exacto del XSD.
 * Los opcionales que no correspondan se omiten (ARCA rechaza tags vacios).
 */
export function buildDetRequest(req: ArcaInvoiceRequest): string {
  const cbteDesde = req.CbteDesde;
  const cbteHasta = req.CbteHasta ?? req.CbteDesde;
  if (!cbteDesde || !cbteHasta) {
    throw ArcaError.rechazado(
      'Falta el numero de comprobante (CbteDesde/CbteHasta) para solicitar el CAE',
    );
  }
  if (requierePeriodoServicio(req.Concepto) && !req.FchServDesde) {
    throw ArcaError.rechazado(
      'Los comprobantes de servicios necesitan el periodo facturado (FchServDesde y FchServHasta)',
    );
  }
  if (!req.CondicionIVAReceptorId) {
    throw ArcaError.rechazado(
      'Falta la condicion frente al IVA del receptor, obligatoria desde la RG 5616',
    );
  }

  const lineas: string[] = [
    tag('Concepto', req.Concepto),
    tag('DocTipo', req.DocTipo),
    tag('DocNro', req.DocNro),
    tag('CbteDesde', cbteDesde),
    tag('CbteHasta', cbteHasta),
    tag('CbteFch', formatFecha(req.CbteFch, 'CbteFch')),
    tag('ImpTotal', formatImporte(req.ImpTotal, 'ImpTotal')),
    tag('ImpTotConc', formatImporte(req.ImpTotConc ?? 0, 'ImpTotConc')),
    tag('ImpNeto', formatImporte(req.ImpNeto, 'ImpNeto')),
    tag('ImpOpEx', formatImporte(req.ImpOpEx ?? 0, 'ImpOpEx')),
    tag('ImpTrib', formatImporte(req.ImpTrib ?? 0, 'ImpTrib')),
    tag('ImpIVA', formatImporte(req.ImpIVA ?? 0, 'ImpIVA')),
  ];

  if (req.FchServDesde) lineas.push(tag('FchServDesde', formatFecha(req.FchServDesde, 'FchServDesde')));
  if (req.FchServHasta) lineas.push(tag('FchServHasta', formatFecha(req.FchServHasta, 'FchServHasta')));
  if (req.FchVtoPago) lineas.push(tag('FchVtoPago', formatFecha(req.FchVtoPago, 'FchVtoPago')));

  lineas.push(tag('MonId', req.MonId || 'PES'));
  lineas.push(tag('MonCotiz', formatImporte(req.MonCotiz ?? 1, 'MonCotiz')));
  lineas.push(tag('CondicionIVAReceptorId', req.CondicionIVAReceptorId));

  // Comprobantes asociados (notas de credito y de debito).
  const asociados = req.CbtesAsoc ?? [];
  if (asociados.length > 0) {
    const items = asociados
      .map((c) => {
        const partes = [
          tag('Tipo', c.Tipo),
          tag('PtoVta', c.PtoVta),
          tag('Nro', c.Nro),
          c.Cuit ? tag('Cuit', soloDigitos(c.Cuit)) : '',
          c.CbteFch ? tag('CbteFch', formatFecha(c.CbteFch, 'CbteAsoc.CbteFch')) : '',
        ].filter(Boolean);
        return `<CbteAsoc>${partes.join('')}</CbteAsoc>`;
      })
      .join('');
    lineas.push(`<CbtesAsoc>${items}</CbtesAsoc>`);
  }

  // Otros tributos (percepciones, impuestos internos, etc).
  const tributos = req.Tributos ?? [];
  if (tributos.length > 0) {
    const items = tributos
      .map((t) =>
        [
          '<Tributo>',
          tag('Id', t.Id),
          tag('Desc', t.Desc),
          tag('BaseImp', formatImporte(t.BaseImp, 'Tributo.BaseImp')),
          tag('Alic', formatImporte(t.Alic, 'Tributo.Alic')),
          tag('Importe', formatImporte(t.Importe, 'Tributo.Importe')),
          '</Tributo>',
        ].join(''),
      )
      .join('');
    lineas.push(`<Tributos>${items}</Tributos>`);
  }

  // Alicuotas de IVA. Los comprobantes clase C no llevan este bloque.
  const iva = req.Iva ?? [];
  if (iva.length > 0) {
    const items = iva
      .map((i) =>
        [
          '<AlicIva>',
          tag('Id', i.Id),
          tag('BaseImp', formatImporte(i.BaseImp, 'AlicIva.BaseImp')),
          tag('Importe', formatImporte(i.Importe, 'AlicIva.Importe')),
          '</AlicIva>',
        ].join(''),
      )
      .join('');
    lineas.push(`<Iva>${items}</Iva>`);
  }

  const cuerpo = lineas
    .filter((l) => l !== '')
    .map((l) => `            ${l}`)
    .join('\n');
  return `          <FECAEDetRequest>\n${cuerpo}\n          </FECAEDetRequest>`;
}

/** Cuerpo completo de FECAESolicitar (un comprobante por request). */
export function buildFECAESolicitarBody(auth: AuthWsfe, req: ArcaInvoiceRequest): string {
  const contenido =
    `${bloqueAuth(auth)}\n` +
    '      <FeCAEReq>\n' +
    '        <FeCabReq>\n' +
    '          <CantReg>1</CantReg>\n' +
    `          <PtoVta>${Number(req.PtoVta)}</PtoVta>\n` +
    `          <CbteTipo>${Number(req.CbteTipo)}</CbteTipo>\n` +
    '        </FeCabReq>\n' +
    '        <FeDetReq>\n' +
    `${buildDetRequest(req)}\n` +
    '        </FeDetReq>\n' +
    '      </FeCAEReq>';
  return operacion('FECAESolicitar', contenido);
}

// ---------------------------------------------------------------------------
// Lectura de la respuesta
// ---------------------------------------------------------------------------

function observaciones(nodo: unknown, contenedor: string, item: string): ArcaObservacion[] {
  return asArray(pick(nodo, contenedor, item)).map((o) => ({
    Code: asNumber(pick(o, 'Code')),
    Msg: asString(pick(o, 'Msg')),
  }));
}

export function leerErrores(resultado: unknown): ArcaObservacion[] {
  return observaciones(resultado, 'Errors', 'Err');
}

/**
 * Pasa los {Code,Msg} de ARCA al {code,msg} que usa el formato de error de la
 * API (ver docs/API.md).
 */
export function aDetalles(obs: ArcaObservacion[]): ArcaErrorDetail[] {
  return obs.map((o) => ({ code: o.Code, msg: o.Msg }));
}

export function leerEventos(resultado: unknown): ArcaObservacion[] {
  return observaciones(resultado, 'Events', 'Evt');
}

/** Codigos con los que WSFEv1 avisa que el token no sirve. */
const CODIGOS_AUTH = new Set([600, 601, 606]);
/** "No existen datos en nuestros registros para los datos ingresados". */
export const CODIGO_SIN_RESULTADOS = 602;

/**
 * Convierte los Errors de una operacion de consulta en una excepcion.
 * Las operaciones que devuelven un comprobante normalizado NO usan esto: ahi
 * el rechazo viaja adentro de la respuesta (resultado 'R').
 */
function lanzarSiHayErrores(resultado: unknown, operacion: string): void {
  const errores = leerErrores(resultado);
  if (errores.length === 0) return;

  if (errores.some((e) => CODIGOS_AUTH.has(e.Code))) {
    throw ArcaError.autenticacion(
      `ARCA rechazo el ticket de acceso en ${operacion}: ${errores[0]?.Msg ?? ''}`,
      aDetalles(errores),
    );
  }

  throw ArcaError.rechazado(
    `ARCA rechazo ${operacion}: ${errores.map((e) => `${e.Code} ${e.Msg}`).join(' | ')}`,
    aDetalles(errores),
  );
}

function resultado(parsed: SoapNode, respuesta: string, resultTag: string): unknown {
  const nodo = pick(parsed, 'Envelope', 'Body', respuesta, resultTag);
  if (nodo === undefined || nodo === null) {
    throw ArcaError.noDisponible(
      `ARCA devolvio una respuesta inesperada en ${respuesta} (falta ${resultTag})`,
    );
  }
  return nodo;
}

/** Normaliza la respuesta de FECAESolicitar al contrato de la app. */
export function parseFECAESolicitarResponse(
  parsed: SoapNode,
  raw: string,
  requestXml: string,
  cbteNroPedido: number,
): ArcaInvoiceResponse {
  const result = resultado(parsed, 'FECAESolicitarResponse', 'FECAESolicitarResult');
  const cabecera = pick(result, 'FeCabResp');
  const detalle = pick(result, 'FeDetResp', 'FECAEDetResponse');
  const det = Array.isArray(detalle) ? detalle[0] : detalle;

  const errores = leerErrores(result);
  const eventos = leerEventos(result);
  const obs = observaciones(det, 'Observaciones', 'Obs');

  const resultadoDet = asString(pick(det, 'Resultado')).toUpperCase();
  const resultadoCab = asString(pick(cabecera, 'Resultado')).toUpperCase();
  const bruto = resultadoDet || resultadoCab;
  const estado: 'A' | 'R' | 'P' =
    bruto === 'A' || bruto === 'P' ? (bruto as 'A' | 'P') : 'R';

  const cae = asString(pick(det, 'CAE'));
  const vto = parseFechaArca(pick(det, 'CAEFchVto'));
  const cbteNro = asNumber(pick(det, 'CbteDesde'), cbteNroPedido);

  // Si ARCA no aprobo y no dijo nada, dejamos al menos un motivo legible.
  if (estado !== 'A' && errores.length === 0 && obs.length === 0) {
    errores.push({
      Code: 0,
      Msg: 'ARCA rechazo el comprobante sin detallar el motivo. Revisá los datos y reintentá.',
    });
  }

  return {
    resultado: estado,
    cae: estado === 'A' && cae ? cae : null,
    caeVencimiento: estado === 'A' ? vto : null,
    cbteNro: cbteNro || cbteNroPedido,
    observaciones: obs,
    errores,
    eventos,
    rawRequest: requestXml,
    rawResponse: raw,
  };
}

/** Normaliza la respuesta de FECompConsultar (estructura distinta a la del CAE). */
export function parseFECompConsultarResponse(
  parsed: SoapNode,
  raw: string,
  requestXml: string,
  cbteNroPedido: number,
): ArcaInvoiceResponse | null {
  const result = resultado(parsed, 'FECompConsultarResponse', 'FECompConsultarResult');
  const errores = leerErrores(result);
  if (errores.some((e) => e.Code === CODIGO_SIN_RESULTADOS)) return null;
  lanzarSiHayErrores(result, 'FECompConsultar');

  const datos = pick(result, 'ResultGet');
  if (!datos) return null;

  const cae = asString(pick(datos, 'CodAutorizacion'));
  const estadoBruto = asString(pick(datos, 'Resultado')).toUpperCase();
  const estado: 'A' | 'R' | 'P' =
    estadoBruto === 'A' || estadoBruto === 'P' ? (estadoBruto as 'A' | 'P') : 'R';

  return {
    resultado: estado,
    cae: cae || null,
    caeVencimiento: parseFechaArca(pick(datos, 'FchVto')),
    cbteNro: asNumber(pick(datos, 'CbteDesde'), cbteNroPedido),
    observaciones: observaciones(datos, 'Observaciones', 'Obs'),
    errores: [],
    eventos: leerEventos(result),
    rawRequest: requestXml,
    rawResponse: raw,
  };
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

function endpoint(env: ArcaEnvironment): string {
  return config.arca.wsfev1[env];
}

/** FEDummy: estado de los servidores de ARCA. No requiere autenticacion. */
export async function feDummy(env: ArcaEnvironment): Promise<ArcaHealth> {
  const res = await soapCall({
    url: endpoint(env),
    body: operacion('FEDummy', ''),
    action: `${NS_FEV1}FEDummy`,
    label: 'FEDummy',
    retries: 1,
  });
  const result = resultado(res.parsed, 'FEDummyResponse', 'FEDummyResult');
  const appServer = asString(pick(result, 'AppServer')) || 'ERROR';
  const dbServer = asString(pick(result, 'DbServer')) || 'ERROR';
  const authServer = asString(pick(result, 'AuthServer')) || 'ERROR';
  return {
    appServer,
    dbServer,
    authServer,
    ok: [appServer, dbServer, authServer].every((s) => s.toUpperCase() === 'OK'),
  };
}

/** FECompUltimoAutorizado: ultimo numero otorgado para un punto de venta y tipo. */
export async function feCompUltimoAutorizado(
  auth: AuthWsfe,
  env: ArcaEnvironment,
  ptoVta: number,
  cbteTipo: number,
): Promise<number> {
  const body = operacion(
    'FECompUltimoAutorizado',
    `${bloqueAuth(auth)}\n` +
      `      <PtoVta>${Number(ptoVta)}</PtoVta>\n` +
      `      <CbteTipo>${Number(cbteTipo)}</CbteTipo>`,
  );
  const res = await soapCall({
    url: endpoint(env),
    body,
    action: `${NS_FEV1}FECompUltimoAutorizado`,
    label: 'FECompUltimoAutorizado',
  });
  const result = resultado(
    res.parsed,
    'FECompUltimoAutorizadoResponse',
    'FECompUltimoAutorizadoResult',
  );
  lanzarSiHayErrores(result, 'FECompUltimoAutorizado');
  return asNumber(pick(result, 'CbteNro'), 0);
}

/** FECAESolicitar: la operacion central, emite el comprobante. */
export async function feCAESolicitar(
  auth: AuthWsfe,
  env: ArcaEnvironment,
  req: ArcaInvoiceRequest,
): Promise<ArcaInvoiceResponse> {
  const body = buildFECAESolicitarBody(auth, req);
  const res = await soapCall({
    url: endpoint(env),
    body,
    action: `${NS_FEV1}FECAESolicitar`,
    label: 'FECAESolicitar',
    // La emision no se reintenta a ciegas: un timeout podria haber otorgado el
    // CAE igual y reintentar duplicaria el comprobante.
    retries: 0,
  });

  const respuesta = parseFECAESolicitarResponse(
    res.parsed,
    res.raw,
    res.requestXml,
    req.CbteDesde ?? 0,
  );

  // Un error de token no es un rechazo del comprobante: hay que renovar el TA.
  if (respuesta.errores.some((e) => CODIGOS_AUTH.has(e.Code))) {
    throw ArcaError.autenticacion(
      `ARCA rechazo el ticket de acceso al emitir: ${respuesta.errores[0]?.Msg ?? ''}`,
      aDetalles(respuesta.errores),
    );
  }

  return respuesta;
}

/** FECompConsultar: trae un comprobante ya emitido. */
export async function feCompConsultar(
  auth: AuthWsfe,
  env: ArcaEnvironment,
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number,
): Promise<ArcaInvoiceResponse | null> {
  const body = operacion(
    'FECompConsultar',
    `${bloqueAuth(auth)}\n` +
      '      <FeCompConsReq>\n' +
      `        <CbteTipo>${Number(cbteTipo)}</CbteTipo>\n` +
      `        <CbteNro>${Number(cbteNro)}</CbteNro>\n` +
      `        <PtoVta>${Number(ptoVta)}</PtoVta>\n` +
      '      </FeCompConsReq>',
  );
  const res = await soapCall({
    url: endpoint(env),
    body,
    action: `${NS_FEV1}FECompConsultar`,
    label: 'FECompConsultar',
  });
  return parseFECompConsultarResponse(res.parsed, res.raw, res.requestXml, cbteNro);
}

/** FEParamGetPtosVenta: puntos de venta habilitados para el CUIT. */
export async function feParamGetPtosVenta(
  auth: AuthWsfe,
  env: ArcaEnvironment,
): Promise<ArcaPuntoVenta[]> {
  const res = await soapCall({
    url: endpoint(env),
    body: operacion('FEParamGetPtosVenta', bloqueAuth(auth)),
    action: `${NS_FEV1}FEParamGetPtosVenta`,
    label: 'FEParamGetPtosVenta',
  });
  const result = resultado(res.parsed, 'FEParamGetPtosVentaResponse', 'FEParamGetPtosVentaResult');
  lanzarSiHayErrores(result, 'FEParamGetPtosVenta');

  return asArray(pick(result, 'ResultGet', 'PtoVenta')).map((p) => {
    const fchBaja = asString(pick(p, 'FchBaja'));
    return {
      Nro: asNumber(pick(p, 'Nro')),
      EmisionTipo: asString(pick(p, 'EmisionTipo')),
      Bloqueado: asBoolSN(pick(p, 'Bloqueado')),
      FchBaja: fchBaja && fchBaja.toUpperCase() !== 'NULL' ? fchBaja : null,
    };
  });
}

/** FEParamGetCotizacion: cotizacion oficial de una moneda. */
export async function feParamGetCotizacion(
  auth: AuthWsfe,
  env: ArcaEnvironment,
  monId: string,
): Promise<number> {
  if (!monId || monId === 'PES') return 1;

  const body = operacion(
    'FEParamGetCotizacion',
    `${bloqueAuth(auth)}\n      <MonId>${escapeXml(monId)}</MonId>`,
  );
  const res = await soapCall({
    url: endpoint(env),
    body,
    action: `${NS_FEV1}FEParamGetCotizacion`,
    label: 'FEParamGetCotizacion',
  });
  const result = resultado(
    res.parsed,
    'FEParamGetCotizacionResponse',
    'FEParamGetCotizacionResult',
  );
  lanzarSiHayErrores(result, 'FEParamGetCotizacion');

  const cotiz = asNumber(pick(result, 'ResultGet', 'MonCotiz'), 0);
  if (cotiz <= 0) {
    throw ArcaError.rechazado(
      `ARCA no devolvio cotizacion para la moneda ${monId}. Cargala manualmente en el comprobante.`,
    );
  }
  return cotiz;
}

export { maskAuth, NS_FEV1 };
