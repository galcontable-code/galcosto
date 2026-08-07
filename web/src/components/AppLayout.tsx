import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { iniciales } from '../lib/format';
import { ArcaStatus, EntornoBadge } from './ArcaStatus';
import { CompanySwitcher } from './CompanySwitcher';
import {
  IconClientes,
  IconComprobantes,
  IconConfiguracion,
  IconEmpresas,
  IconFacturar,
  IconInicio,
  IconLuna,
  IconMenu,
  IconProductos,
  IconSalir,
  IconSol,
} from './Icons';
import { Badge, Button, cx, Kbd } from './ui';
import { useTheme } from '../lib/theme';

interface ItemNav {
  to: string;
  label: string;
  Icono: (p: { className?: string }) => JSX.Element;
  end?: boolean;
}

const NAV: ItemNav[] = [
  { to: '/', label: 'Inicio', Icono: IconInicio, end: true },
  { to: '/facturar', label: 'Facturar', Icono: IconFacturar },
  { to: '/comprobantes', label: 'Comprobantes', Icono: IconComprobantes },
  { to: '/clientes', label: 'Clientes', Icono: IconClientes },
  { to: '/productos', label: 'Productos', Icono: IconProductos },
  { to: '/empresas', label: 'Empresas', Icono: IconEmpresas },
  { to: '/configuracion', label: 'Configuración', Icono: IconConfiguracion },
];

function Marca(): JSX.Element {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-black text-white shadow-sm">
        G
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          Galcosto
        </span>
        <span className="block text-[10px] font-medium uppercase leading-tight tracking-wider text-slate-400">
          Facturación ARCA
        </span>
      </span>
    </Link>
  );
}

function Navegacion({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Navegación principal">
      {NAV.map(({ to, label, Icono, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
            )
          }
        >
          <Icono className="h-[18px] w-[18px] shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function BotonTema(): JSX.Element {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {theme === 'dark' ? <IconSol className="h-4 w-4" /> : <IconLuna className="h-4 w-4" />}
    </button>
  );
}

function PieUsuario({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const { user, studio, logout, demoMode } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      {demoMode ? (
        <div className="mb-2.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          <p className="font-semibold">Modo demo activo</p>
          <p className="opacity-90">Los CAE son simulados, sin validez fiscal.</p>
        </div>
      ) : null}
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {user ? iniciales(user.name) : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
            {user?.name ?? '—'}
          </p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {studio?.name ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            logout();
            navigate('/login');
          }}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200/70 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <IconSalir className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AppLayout(): JSX.Element {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { company } = useCompany();
  const location = useLocation();

  // En mobile el sidebar se cierra al navegar.
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  const environment = company?.environment ?? 'HOMO';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Sidebar fijo en escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 items-center justify-between px-4">
          <Marca />
          <BotonTema />
        </div>
        <Navegacion />
        <div className="px-3 pb-3">
          <div className="rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Atajos</p>
            <p>
              <Kbd>Enter</Kbd> avanzar · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> emitir
            </p>
          </div>
        </div>
        <PieUsuario />
      </aside>

      {/* Sidebar deslizante en mobile */}
      {menuAbierto ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMenuAbierto(false)}
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-64 max-w-[85vw] animate-slide-in flex-col border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-14 items-center justify-between px-4">
              <Marca />
              <BotonTema />
            </div>
            <Navegacion onNavigate={() => setMenuAbierto(false)} />
            <PieUsuario onNavigate={() => setMenuAbierto(false)} />
          </aside>
        </div>
      ) : null}

      {/* Barra superior */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-200/70 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <IconMenu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <CompanySwitcher />
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <EntornoBadge environment={environment} />
              <ArcaStatus environment={environment} />
            </div>

            <Link to="/facturar" className="shrink-0">
              <Button tamano="md" iconoIzq={<IconFacturar className="h-4 w-4" />}>
                <span className="hidden sm:inline">Nueva factura</span>
                <span className="sm:hidden">Facturar</span>
              </Button>
            </Link>
          </div>

          {/* En mobile el entorno y el estado van en una segunda fila */}
          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-1.5 sm:hidden dark:border-slate-800">
            <EntornoBadge environment={environment} />
            <ArcaStatus environment={environment} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
          {!company ? <SinEmpresa /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SinEmpresa(): JSX.Element {
  const { cargando } = useCompany();
  if (cargando) return <></>;
  return (
    <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            No tenés ninguna empresa emisora cargada
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Para poder facturar necesitás dar de alta al menos un CUIT emisor y subirle el
            certificado de ARCA.
          </p>
        </div>
        <Link to="/empresas">
          <Button variante="secundario">Cargar empresa</Button>
        </Link>
      </div>
    </div>
  );
}

/** Barra de contexto reutilizable (entorno + estado) para pantallas sueltas. */
export function ContextoEmpresa(): JSX.Element | null {
  const { company } = useCompany();
  if (!company) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tono="contorno">{company.razonSocial}</Badge>
      <EntornoBadge environment={company.environment} />
    </div>
  );
}
