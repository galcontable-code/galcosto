import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, getToken, onUnauthorized, setToken } from './api';
import type { HealthPayload, Studio, User } from './types';

interface AuthContextValue {
  user: User | null;
  studio: Studio | null;
  /** true mientras se resuelve la sesión guardada. */
  cargando: boolean;
  autenticado: boolean;
  /** `demoMode` de `GET /api/health`: los CAE son simulados. */
  demoMode: boolean;
  version: string;
  login: (email: string, password: string) => Promise<void>;
  registrar: (input: {
    studioName: string;
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  refrescar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [health, setHealth] = useState<HealthPayload | null>(null);

  // Estado del backend (modo demo / versión). Público, no requiere sesión.
  useEffect(() => {
    let vivo = true;
    api
      .health()
      .then((h) => {
        if (vivo) setHealth(h);
      })
      .catch(() => {
        /* si health falla, la app igual funciona */
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Rehidratación de la sesión guardada.
  useEffect(() => {
    let vivo = true;
    if (!getToken()) {
      setCargando(false);
      return;
    }
    api
      .me()
      .then((res) => {
        if (!vivo) return;
        setUser(res.user);
        setStudio(res.studio);
      })
      .catch(() => {
        if (vivo) {
          setToken(null);
          setUser(null);
          setStudio(null);
        }
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // El cliente HTTP avisa cuando el backend devolvió 401.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        setStudio(null);
      }),
    [],
  );

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setToken(res.token);
    setUser(res.user);
    setStudio(res.studio);
  }, []);

  const registrar = useCallback(
    async (input: { studioName: string; name: string; email: string; password: string }) => {
      const res = await api.register(input);
      setToken(res.token);
      setUser(res.user);
      setStudio(res.studio);
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStudio(null);
    try {
      localStorage.removeItem('galcosto.companyId');
      sessionStorage.removeItem('galcosto.wizard');
    } catch {
      /* sin storage */
    }
  }, []);

  const refrescar = useCallback(async () => {
    const res = await api.me();
    setUser(res.user);
    setStudio(res.studio);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      studio,
      cargando,
      autenticado: Boolean(user),
      demoMode: health?.demoMode ?? false,
      version: health?.version ?? '',
      login,
      registrar,
      logout,
      refrescar,
    }),
    [user, studio, cargando, health, login, registrar, logout, refrescar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>');
  return ctx;
}

/** Portero de las rutas privadas. */
export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { autenticado, cargando } = useAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-brand-600"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
            />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando tu sesión…</p>
        </div>
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
