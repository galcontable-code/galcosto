/**
 * Tipos del contrato de la API (docs/API.md) y de las entidades de Prisma.
 *
 * Todo lo que viaja por la red pasa por acá. Las fechas llegan como string
 * ISO (el backend serializa `DateTime` a JSON), así que se tipan como string.
 */

export type ArcaEnvironment = 'HOMO' | 'PROD';
export type CondicionIvaEmisor = 'RI' | 'MONOTRIBUTO' | 'EXENTO';
export type EstadoComprobante = 'BORRADOR' | 'EMITIDA' | 'RECHAZADA' | 'ANULADA';

/* ------------------------------------------------------------------ auth */

export interface User {
  id: string;
  studioId: string;
  email: string;
  name: string;
  role: string;
  active?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Studio {
  id: string;
  name: string;
  cuit?: string | null;
  email?: string | null;
  createdAt?: string;
}

export interface AuthPayload {
  token: string;
  user: User;
  studio: Studio;
}

export interface MePayload {
  user: User;
  studio: Studio;
}

/* -------------------------------------------------------------- empresas */

export interface Company {
  id: string;
  studioId?: string;
  razonSocial: string;
  cuit: string;
  nombreFantasia?: string | null;
  condicionIva: CondicionIvaEmisor;
  domicilio?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  ingresosBrutos?: string | null;
  inicioActividades?: string | null;
  logoDataUrl?: string | null;
  environment: ArcaEnvironment;
  certUploadedAt?: string | null;
  certSubject?: string | null;
  certExpiresAt?: string | null;
  /** Metadato que expone el backend: si tiene certificado + clave cargados. */
  hasCredentials?: boolean;
  defaultPtoVta: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyInput {
  razonSocial: string;
  cuit: string;
  nombreFantasia?: string | null;
  condicionIva: CondicionIvaEmisor;
  domicilio?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  ingresosBrutos?: string | null;
  environment: ArcaEnvironment;
  defaultPtoVta: number;
}

export interface CredentialsResult {
  certSubject: string;
  certExpiresAt: string | null;
}

export interface ArcaHealth {
  appServer: string;
  dbServer: string;
  authServer: string;
  ok: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  health?: ArcaHealth;
  ta?: { expirationTime: string };
  message?: string;
}

export interface PuntoVenta {
  Nro: number;
  EmisionTipo: string;
  Bloqueado: boolean;
  FchBaja: string | null;
}

export interface NextNumber {
  ultimoAutorizado: number;
  proximo: number;
}

/* -------------------------------------------------------------- clientes */

export interface Customer {
  id: string;
  studioId?: string;
  companyId?: string | null;
  razonSocial: string;
  docTipo: number;
  docNro: string;
  condicionIvaReceptorId: number;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  notas?: string | null;
  active?: boolean;
  createdAt?: string;
}

export interface CustomerInput {
  companyId?: string | null;
  razonSocial: string;
  docTipo: number;
  docNro: string;
  condicionIvaReceptorId: number;
  email?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  notas?: string | null;
}

export interface PadronData {
  cuit: string;
  razonSocial: string;
  tipoPersona: 'FISICA' | 'JURIDICA';
  estadoClave: string;
  domicilio?: string;
  localidad?: string;
  provincia?: string;
  codPostal?: string;
  condicionIvaReceptorId: number;
  esMonotributista: boolean;
  impuestos: string[];
}

/* ------------------------------------------------------------- productos */

export interface Product {
  id: string;
  companyId: string;
  codigo?: string | null;
  descripcion: string;
  unidad: string;
  precioUnitario: number;
  ivaId: number;
  precioConIva: boolean;
  active?: boolean;
}

export interface ProductInput {
  companyId: string;
  codigo?: string | null;
  descripcion: string;
  unidad?: string;
  precioUnitario: number;
  ivaId: number;
  precioConIva?: boolean;
}

/* ---------------------------------------------------------- comprobantes */

export interface InvoiceItemInput {
  productId?: string | null;
  descripcion: string;
  cantidad: number;
  unidad?: string;
  precioUnitario: number;
  bonificacion?: number;
  ivaId: number;
  precioConIva?: boolean;
}

export interface TributoInput {
  tributoId: number;
  descripcion: string;
  baseImp: number;
  alicuota: number;
}

export interface InvoiceInput {
  companyId: string;
  ptoVta: number;
  cbteTipo?: number;
  concepto: number;
  customerId?: string | null;
  docTipo: number;
  docNro: string;
  receptorRazonSocial?: string;
  receptorDomicilio?: string;
  condicionIvaReceptorId: number;
  fechaCbte: string;
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
  monId: string;
  monCotiz: number;
  items: InvoiceItemInput[];
  tributos?: TributoInput[];
  observaciones?: string;
}

export interface InvoiceItem {
  id?: string;
  productId?: string | null;
  orden?: number;
  descripcion: string;
  cantidad: number;
  unidad?: string;
  precioUnitario: number;
  bonificacion: number;
  ivaId: number;
  subtotalNeto: number;
  importeIva: number;
  subtotalConIva: number;
}

export interface Tributo {
  id?: string;
  tributoId: number;
  descripcion: string;
  baseImp: number;
  alicuota: number;
  importe: number;
}

export interface IvaLine {
  Id: number;
  BaseImp: number;
  Importe: number;
}

export interface ArcaObservacion {
  code?: number;
  msg?: string;
  Code?: number;
  Msg?: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  customerId?: string | null;
  ptoVta: number;
  cbteTipo: number;
  cbteNro?: number | null;
  concepto: number;
  docTipo: number;
  docNro: string;
  receptorRazonSocial?: string | null;
  receptorDomicilio?: string | null;
  condicionIvaReceptorId: number;
  fechaCbte: string;
  fchServDesde?: string | null;
  fchServHasta?: string | null;
  fchVtoPago?: string | null;
  monId: string;
  monCotiz: number;
  impNeto: number;
  impIVA: number;
  impTotConc?: number;
  impOpEx?: number;
  impTrib: number;
  impTotal: number;
  estado: EstadoComprobante;
  cae?: string | null;
  caeVto?: string | null;
  resultado?: string | null;
  numeroFormateado?: string;
  letra?: string;
  descripcionComprobante?: string;
  qrUrl?: string | null;
  qrPayload?: string | null;
  pdfUrl?: string | null;
  observaciones?: ArcaObservacion[] | string | null;
  arcaErrors?: ArcaObservacion[] | string | null;
  environment?: ArcaEnvironment;
  emitidaAt?: string | null;
  createdAt?: string;
  items?: InvoiceItem[];
  tributos?: Tributo[];
  company?: Company;
  customer?: Customer | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InvoiceTotals {
  items: InvoiceItem[];
  impNeto: number;
  impIVA: number;
  impTotConc: number;
  impOpEx: number;
  impTrib: number;
  impTotal: number;
  iva: IvaLine[];
  tributos: Tributo[];
}

export interface PreviewResult {
  totals: InvoiceTotals;
  proximoNumero: number;
  cbteTipoSugerido: number;
  validaciones: string[];
}

export interface ArcaLog {
  request?: string | null;
  response?: string | null;
  arcaRequest?: string | null;
  arcaResponse?: string | null;
}

/* ------------------------------------------------------------- catálogos */

export interface CatalogEntry<T = number> {
  id: T;
  desc: string;
}

export interface AlicuotaIva extends CatalogEntry<number> {
  rate: number;
}

export interface Catalogs {
  tiposComprobante: CatalogEntry<number>[];
  tiposDocumento: CatalogEntry<number>[];
  alicuotasIva: AlicuotaIva[];
  condicionesIvaReceptor: CatalogEntry<number>[];
  conceptos: CatalogEntry<number>[];
  monedas: CatalogEntry<string>[];
  tiposTributo: CatalogEntry<number>[];
  unidades: CatalogEntry<string | number>[];
}

/* ------------------------------------------------------------- dashboard */

export interface SerieDiariaPunto {
  fecha: string;
  total: number;
  cantidad?: number;
}

export interface PorTipoPunto {
  cbteTipo: number;
  descripcion?: string;
  cantidad: number;
  total: number;
}

export interface DashboardData {
  emitidas: number;
  totalFacturado: number;
  ivaLiquidado: number;
  promedio: number;
  ultimasFacturas: Invoice[];
  serieDiaria: SerieDiariaPunto[];
  porTipo: PorTipoPunto[];
  estadoArca?: ArcaHealth | null;
}

/* ----------------------------------------------------------------- salud */

export interface HealthPayload {
  ok: boolean;
  version: string;
  demoMode: boolean;
  uptime: number;
}
