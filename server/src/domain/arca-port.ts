/**
 * Contrato de la integracion con ARCA.
 *
 * Este es el limite entre la logica de negocio y los web services de ARCA.
 * Existen dos implementaciones intercambiables:
 *   - `RealArcaClient`  -> habla SOAP contra WSAA + WSFEv1 (arca/client.ts)
 *   - `DemoArcaClient`  -> simula respuestas para poder usar la app sin
 *                          certificados (arca/demo-client.ts)
 *
 * La seleccion se hace en arca/index.ts segun ARCA_DEMO_MODE / si la empresa
 * tiene credenciales cargadas.
 */

export type ArcaEnvironment = 'HOMO' | 'PROD';

/** Credenciales y contexto de la empresa emisora para hablar con ARCA. */
export interface ArcaCredentials {
  companyId: string;
  cuit: string;
  environment: ArcaEnvironment;
  /** Certificado X.509 en PEM (ya descifrado). */
  certPem: string;
  /** Clave privada en PEM (ya descifrada). */
  keyPem: string;
}

/** Ticket de acceso devuelto por WSAA. */
export interface ArcaTicketAccess {
  token: string;
  sign: string;
  generationTime: Date;
  expirationTime: Date;
}

/** Una linea de alicuota de IVA agrupada, tal como la espera WSFEv1. */
export interface ArcaIvaLine {
  /** Id de alicuota (3,4,5,6,8,9). */
  Id: number;
  /** Base imponible gravada a esa alicuota. */
  BaseImp: number;
  /** Importe de IVA liquidado. */
  Importe: number;
}

export interface ArcaTributoLine {
  Id: number;
  Desc: string;
  BaseImp: number;
  Alic: number;
  Importe: number;
}

export interface ArcaCbteAsoc {
  Tipo: number;
  PtoVta: number;
  Nro: number;
  Cuit?: string;
  CbteFch?: string; // yyyymmdd
}

/**
 * Solicitud de CAE para un comprobante.
 * Las fechas van en formato yyyymmdd (string), como pide ARCA.
 */
export interface ArcaInvoiceRequest {
  PtoVta: number;
  CbteTipo: number;
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  /** Numero de comprobante. Si se omite, se resuelve con getUltimoAutorizado + 1. */
  CbteDesde?: number;
  CbteHasta?: number;
  CbteFch: string;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpTrib: number;
  ImpIVA: number;
  /** Obligatorio para concepto 2 o 3. */
  FchServDesde?: string;
  FchServHasta?: string;
  FchVtoPago?: string;
  MonId: string;
  MonCotiz: number;
  /** Condicion IVA del receptor (RG 5616). Obligatorio. */
  CondicionIVAReceptorId: number;
  Iva?: ArcaIvaLine[];
  Tributos?: ArcaTributoLine[];
  CbtesAsoc?: ArcaCbteAsoc[];
}

export interface ArcaObservacion {
  Code: number;
  Msg: string;
}

/** Respuesta de FECAESolicitar, normalizada. */
export interface ArcaInvoiceResponse {
  /** 'A' aprobado, 'R' rechazado, 'P' parcial. */
  resultado: 'A' | 'R' | 'P';
  cae: string | null;
  caeVencimiento: Date | null;
  cbteNro: number;
  observaciones: ArcaObservacion[];
  errores: ArcaObservacion[];
  eventos: ArcaObservacion[];
  /** XML crudo intercambiado, para auditoria. */
  rawRequest: string;
  rawResponse: string;
}

export interface ArcaPuntoVenta {
  Nro: number;
  EmisionTipo: string;
  Bloqueado: boolean;
  FchBaja: string | null;
}

/** Datos del contribuyente devueltos por el padron ARCA. */
export interface ArcaPadronData {
  cuit: string;
  razonSocial: string;
  tipoPersona: 'FISICA' | 'JURIDICA';
  estadoClave: string;
  domicilio?: string;
  localidad?: string;
  provincia?: string;
  codPostal?: string;
  /** Condicion IVA inferida para precargar el comprobante. */
  condicionIvaReceptorId: number;
  esMonotributista: boolean;
  impuestos: string[];
}

export interface ArcaHealth {
  appServer: string;
  dbServer: string;
  authServer: string;
  ok: boolean;
}

/**
 * Puerto de salida hacia ARCA. Todas las operaciones que la app necesita.
 * Los errores se lanzan como `ArcaError` (ver arca/errors.ts).
 */
export interface ArcaClient {
  /** Ping a WSFEv1 (FEDummy). No requiere autenticacion. */
  health(env: ArcaEnvironment): Promise<ArcaHealth>;

  /** Obtiene (o reusa del cache) un Ticket de Acceso para un servicio. */
  authenticate(creds: ArcaCredentials, service?: string): Promise<ArcaTicketAccess>;

  /** Ultimo numero autorizado para un punto de venta y tipo de comprobante. */
  getUltimoAutorizado(
    creds: ArcaCredentials,
    ptoVta: number,
    cbteTipo: number,
  ): Promise<number>;

  /** Solicita el CAE. Es la operacion central: emite el comprobante. */
  solicitarCAE(
    creds: ArcaCredentials,
    req: ArcaInvoiceRequest,
  ): Promise<ArcaInvoiceResponse>;

  /** Puntos de venta habilitados para el CUIT. */
  getPuntosVenta(creds: ArcaCredentials): Promise<ArcaPuntoVenta[]>;

  /** Cotizacion oficial de una moneda para la fecha del comprobante. */
  getCotizacion(creds: ArcaCredentials, monId: string): Promise<number>;

  /** Consulta un comprobante ya emitido (FECompConsultar). */
  consultarComprobante(
    creds: ArcaCredentials,
    ptoVta: number,
    cbteTipo: number,
    cbteNro: number,
  ): Promise<ArcaInvoiceResponse | null>;

  /** Datos de un contribuyente por CUIT (padron A5). */
  consultarPadron(creds: ArcaCredentials, cuit: string): Promise<ArcaPadronData | null>;
}
