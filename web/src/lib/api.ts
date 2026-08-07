/**
 * Cliente HTTP tipado contra la API de Galcosto.
 *
 * - El token JWT vive en localStorage y se adjunta como `Authorization: Bearer`.
 * - Los errores del backend siempre vienen con la forma
 *   `{ error: { code, message, details? } }` (ver docs/API.md) y se convierten
 *   en una `ApiError`, así el resto de la app trabaja con un solo tipo.
 * - Un 401 limpia la sesión y manda a /login.
 */

import type {
  ArcaHealth,
  ArcaLog,
  AuthPayload,
  Catalogs,
  Company,
  CompanyInput,
  CredentialsResult,
  Customer,
  CustomerInput,
  DashboardData,
  HealthPayload,
  Invoice,
  InvoiceInput,
  MePayload,
  NextNumber,
  PadronData,
  Paginated,
  PreviewResult,
  Product,
  ProductInput,
  PuntoVenta,
  TestConnectionResult,
} from './types';

const TOKEN_KEY = 'galcosto.token';

export interface ApiErrorDetail {
  code?: number | string;
  msg?: string;
  message?: string;
  path?: string;
  field?: string;
}

/** Error normalizado del backend. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** ARCA rechazó el comprobante: hay errores accionables para mostrar. */
  get esRechazoArca(): boolean {
    return this.code === 'ARCA_REJECTED' || this.status === 422;
  }

  get esArcaCaido(): boolean {
    return this.code === 'ARCA_UNAVAILABLE' || this.status === 503;
  }

  /** Lista de líneas legibles para mostrar en pantalla. */
  get lineas(): string[] {
    return this.details
      .map((d) => {
        const texto = d.msg ?? d.message ?? '';
        const campo = d.path ?? d.field;
        if (d.code !== undefined && texto) return `[${d.code}] ${texto}`;
        if (campo && texto) return `${campo}: ${texto}`;
        return texto;
      })
      .filter((l) => l.length > 0);
  }
}

/* ---------------------------------------------------------------- token */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Se dispara en un 401 para que AuthProvider limpie el estado en memoria. */
const NO_AUTORIZADO = 'galcosto:no-autorizado';

export function onUnauthorized(handler: () => void): () => void {
  const listener = (): void => handler();
  window.addEventListener(NO_AUTORIZADO, listener);
  return () => window.removeEventListener(NO_AUTORIZADO, listener);
}

function manejarNoAutorizado(): void {
  setToken(null);
  window.dispatchEvent(new Event(NO_AUTORIZADO));
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

/* --------------------------------------------------------------- fetch */

type Query = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query)) {
    if (valor === undefined || valor === null || valor === '') continue;
    params.set(clave, String(valor));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Si es false, un 401 no redirige (lo usa el login). */
  redirectOn401?: boolean;
}

function esRespuestaDeError(valor: unknown): valor is {
  error: { code?: string; message?: string; details?: ApiErrorDetail[] };
} {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'error' in valor &&
    typeof (valor as { error: unknown }).error === 'object'
  );
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, redirectOn401 = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(`/api${path}`, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.',
    );
  }

  if (res.status === 401 && redirectOn401) {
    manejarNoAutorizado();
    throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Ingresá de nuevo.');
  }

  if (res.status === 204) return undefined as T;

  const texto = await res.text();
  let data: unknown = null;
  if (texto) {
    try {
      data = JSON.parse(texto) as unknown;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (esRespuestaDeError(data)) {
      const { code, message, details } = data.error;
      throw new ApiError(
        res.status,
        code ?? 'INTERNAL',
        message ?? 'Ocurrió un error inesperado.',
        Array.isArray(details) ? details : [],
      );
    }
    throw new ApiError(
      res.status,
      'INTERNAL',
      texto.slice(0, 300) || `Error ${res.status} del servidor.`,
    );
  }

  return data as T;
}

/** Descarga binaria autenticada (PDF del comprobante). */
async function blob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { headers });
  if (res.status === 401) {
    manejarNoAutorizado();
    throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Ingresá de nuevo.');
  }
  if (!res.ok) {
    let mensaje = `No pudimos generar el archivo (error ${res.status}).`;
    try {
      const data: unknown = JSON.parse(await res.text());
      if (esRespuestaDeError(data) && data.error.message) mensaje = data.error.message;
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new ApiError(res.status, 'INTERNAL', mensaje);
  }
  return res.blob();
}

/* ------------------------------------------------------------ endpoints */

export const api = {
  request,
  blob,

  /* auth */
  register: (body: { studioName: string; name: string; email: string; password: string }) =>
    request<AuthPayload>('/auth/register', { method: 'POST', body, redirectOn401: false }),
  login: (body: { email: string; password: string }) =>
    request<AuthPayload>('/auth/login', { method: 'POST', body, redirectOn401: false }),
  me: () => request<MePayload>('/auth/me'),

  /* empresas */
  companies: () => request<Company[]>('/companies'),
  company: (id: string) => request<Company>(`/companies/${id}`),
  createCompany: (body: CompanyInput) =>
    request<Company>('/companies', { method: 'POST', body }),
  updateCompany: (id: string, body: Partial<CompanyInput>) =>
    request<Company>(`/companies/${id}`, { method: 'PATCH', body }),
  deleteCompany: (id: string) => request<void>(`/companies/${id}`, { method: 'DELETE' }),
  uploadCredentials: (id: string, body: { certPem: string; keyPem: string }) =>
    request<CredentialsResult>(`/companies/${id}/credentials`, { method: 'POST', body }),
  deleteCredentials: (id: string) =>
    request<void>(`/companies/${id}/credentials`, { method: 'DELETE' }),
  testConnection: (id: string) =>
    request<TestConnectionResult>(`/companies/${id}/test-connection`, { method: 'POST' }),
  puntosVenta: (id: string) => request<PuntoVenta[]>(`/companies/${id}/puntos-venta`),
  nextNumber: (id: string, ptoVta: number, cbteTipo: number) =>
    request<NextNumber>(`/companies/${id}/next-number`, { query: { ptoVta, cbteTipo } }),

  /* clientes */
  customers: (query?: { search?: string; companyId?: string }) =>
    request<Customer[] | Paginated<Customer>>('/customers', { query }),
  customer: (id: string) => request<Customer>(`/customers/${id}`),
  createCustomer: (body: CustomerInput) =>
    request<Customer>('/customers', { method: 'POST', body }),
  updateCustomer: (id: string, body: Partial<CustomerInput>) =>
    request<Customer>(`/customers/${id}`, { method: 'PATCH', body }),
  deleteCustomer: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
  padron: (cuit: string, companyId?: string, signal?: AbortSignal) =>
    request<PadronData>(`/padron/${cuit}`, { query: { companyId }, signal }),

  /* productos */
  products: (query?: { companyId?: string; search?: string }, signal?: AbortSignal) =>
    request<Product[] | Paginated<Product>>('/products', { query, signal }),
  createProduct: (body: ProductInput) =>
    request<Product>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Partial<ProductInput>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),

  /* comprobantes */
  preview: (body: InvoiceInput, signal?: AbortSignal) =>
    request<PreviewResult>('/invoices/preview', { method: 'POST', body, signal }),
  emitir: (body: InvoiceInput) => request<Invoice>('/invoices', { method: 'POST', body }),
  invoices: (query?: {
    companyId?: string;
    estado?: string;
    desde?: string;
    hasta?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => request<Paginated<Invoice>>('/invoices', { query }),
  invoice: (id: string) => request<Invoice>(`/invoices/${id}`),
  creditNote: (id: string, body: { motivo?: string }) =>
    request<Invoice>(`/invoices/${id}/credit-note`, { method: 'POST', body }),
  retryInvoice: (id: string) => request<Invoice>(`/invoices/${id}/retry`, { method: 'POST' }),
  arcaLog: (id: string) => request<ArcaLog>(`/invoices/${id}/arca-log`),
  invoicePdf: (id: string) => blob(`/invoices/${id}/pdf`),

  /* catálogos, dashboard y salud */
  catalogs: () => request<Catalogs>('/catalogs'),
  dashboard: (query?: { companyId?: string; periodo?: string }) =>
    request<DashboardData>('/dashboard', { query }),
  health: () => request<HealthPayload>('/health', { redirectOn401: false }),
  arcaStatus: (environment: string) =>
    request<ArcaHealth>('/arca/status', { query: { environment }, redirectOn401: false }),
};

/** Normaliza respuestas que pueden venir como array plano o paginadas. */
export function comoLista<T>(res: T[] | Paginated<T>): T[] {
  return Array.isArray(res) ? res : res.items;
}

/** Mensaje seguro para mostrarle al usuario ante cualquier excepción. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error inesperado.';
}
