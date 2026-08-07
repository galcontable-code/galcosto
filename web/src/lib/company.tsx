import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { api, mensajeDeError } from './api';
import { useAuth } from './auth';
import type { Company } from './types';

/**
 * Empresa emisora seleccionada.
 *
 * El estudio factura por muchos CUIT: casi todas las pantallas filtran por la
 * empresa activa, así que vive en un contexto y se persiste en localStorage.
 */

const STORAGE_KEY = 'galcosto.companyId';

interface CompanyContextValue {
  companies: Company[];
  company: Company | null;
  companyId: string | null;
  cargando: boolean;
  error: string | null;
  seleccionar: (id: string) => void;
  recargar: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function CompanyProvider({ children }: { children: ReactNode }): JSX.Element {
  const { autenticado } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(leerGuardado);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const lista = await api.companies();
      const activas = lista.filter((c) => c.active !== false);
      setCompanies(activas);
      setCompanyId((actual) => {
        if (actual && activas.some((c) => c.id === actual)) return actual;
        return activas[0]?.id ?? null;
      });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!autenticado) {
      setCompanies([]);
      return;
    }
    void cargar();
  }, [autenticado, cargar]);

  useEffect(() => {
    try {
      if (companyId) localStorage.setItem(STORAGE_KEY, companyId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin storage */
    }
  }, [companyId]);

  const seleccionar = useCallback((id: string) => setCompanyId(id), []);

  const value = useMemo<CompanyContextValue>(() => {
    const company = companies.find((c) => c.id === companyId) ?? null;
    return {
      companies,
      company,
      companyId: company?.id ?? null,
      cargando,
      error,
      seleccionar,
      recargar: cargar,
    };
  }, [companies, companyId, cargando, error, seleccionar, cargar]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany tiene que usarse dentro de <CompanyProvider>');
  return ctx;
}
