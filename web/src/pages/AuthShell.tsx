import type { ReactNode } from 'react';
import { useTheme } from '../lib/theme';
import { IconCheck, IconLuna, IconRayo, IconSol } from '../components/Icons';

const PASOS = [
  { n: 1, t: 'Elegí el cliente', d: 'Traé sus datos del padrón de ARCA con el CUIT.' },
  { n: 2, t: 'Cargá los ítems', d: 'Los totales y el IVA se calculan solos.' },
  { n: 3, t: 'Emitís y listo', d: 'CAE en el momento, con QR y PDF listos para enviar.' },
];

/** Marco compartido por login y registro: panel de marca + formulario. */
export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  const { theme, toggle } = useTheme();

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Panel de marca (sólo escritorio) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex xl:w-[55%]">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(90,140,255,.6), transparent 45%), radial-gradient(circle at 85% 75%, rgba(20,29,71,.9), transparent 50%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-black text-brand-900">
              G
            </span>
            <div>
              <p className="text-lg font-bold leading-tight tracking-tight">Galcosto</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-200">
                Facturación electrónica ARCA
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-100">
            <IconRayo className="h-3.5 w-3.5" />
            En tiempo real
          </p>
          <h2 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight">
            Facturá en ARCA en tiempo real, en 3 pasos.
          </h2>
          <p className="mt-4 text-brand-100">
            Pensado para estudios contables que facturan por muchos CUIT: un solo lugar, todos tus
            clientes, el CAE en el momento.
          </p>

          <ul className="mt-8 space-y-4">
            {PASOS.map((p) => (
              <li key={p.n} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                  {p.n}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.t}</span>
                  <span className="block text-sm text-brand-200">{p.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap gap-x-5 gap-y-2 text-xs text-brand-200">
          <span className="inline-flex items-center gap-1.5">
            <IconCheck className="h-3.5 w-3.5" /> WSFEv1 + WSAA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconCheck className="h-3.5 w-3.5" /> Padrón A5
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconCheck className="h-3.5 w-3.5" /> QR y PDF obligatorios
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconCheck className="h-3.5 w-3.5" /> RG 5616 (condición IVA receptor)
          </span>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex w-full flex-col lg:w-1/2 xl:w-[45%]">
        <div className="flex justify-end p-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <IconSol className="h-4 w-4" /> : <IconLuna className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-lg font-black text-white">
                G
              </span>
              <div>
                <p className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                  Galcosto
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Facturá en ARCA en tiempo real
                </p>
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
