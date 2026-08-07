/**
 * Componentes base de la interfaz: Button, Input, Select, Card, Badge,
 * Spinner, EmptyState, Table y helpers de layout.
 *
 * Todos soportan modo oscuro y foco visible.
 */
import { forwardRef, useId } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { IconAlerta, IconCheck, IconInfo } from './Icons';

export function cx(...clases: Array<string | number | false | null | undefined>): string {
  return clases.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------- Spinner */

export function Spinner({ className = 'h-4 w-4' }: { className?: string }): JSX.Element {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  );
}

/* -------------------------------------------------------------- Button */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'exito';
type Tamano = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 border border-transparent shadow-sm dark:bg-brand-600 dark:hover:bg-brand-500',
  secundario:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 shadow-sm dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
  fantasma:
    'bg-transparent text-slate-600 border border-transparent hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800',
  peligro:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border border-transparent shadow-sm',
  exito:
    'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 border border-transparent shadow-sm',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  xl: 'h-14 px-7 text-base font-semibold gap-2.5 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  iconoIzq?: ReactNode;
  iconoDer?: ReactNode;
  ancho?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = 'primario',
    tamano = 'md',
    cargando = false,
    iconoIzq,
    iconoDer,
    ancho = false,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        TAMANOS[tamano],
        ancho && 'w-full',
        className,
      )}
      {...props}
    >
      {cargando ? <Spinner className="h-4 w-4" /> : iconoIzq}
      {children}
      {iconoDer}
    </button>
  );
});

/* --------------------------------------------------------------- Field */

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  ok?: string | null;
  requerido?: boolean;
  /**
   * Como render prop recibe el id y lo asocia al label con `htmlFor`. Como
   * nodo suelto, el control se envuelve en el propio `<label>`, que asocia
   * igual de bien sin obligar a cablear el id a mano.
   */
  children: ReactNode | ((id: string) => ReactNode);
  className?: string;
}

/** Envoltorio de campo con label real, ayuda y mensajes de validación. */
export function Field({
  label,
  hint,
  error,
  ok,
  requerido,
  children,
  className,
}: FieldProps): JSX.Element {
  const id = useId();
  const esRenderProp = typeof children === 'function';
  const textoLabel = label ? (
    <>
      {label}
      {requerido ? <span className="ml-0.5 text-red-500">*</span> : null}
    </>
  ) : null;

  return (
    <div className={cx('min-w-0', className)}>
      {esRenderProp ? (
        <>
          {textoLabel ? (
            <label htmlFor={id} className="lbl">
              {textoLabel}
            </label>
          ) : null}
          {(children as (id: string) => ReactNode)(id)}
        </>
      ) : textoLabel ? (
        // Asociacion implicita: el control va adentro del label.
        <label className="block">
          <span className="lbl">{textoLabel}</span>
          {children as ReactNode}
        </label>
      ) : (
        (children as ReactNode)
      )}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <IconAlerta className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : ok ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <IconCheck className="h-3.5 w-3.5 shrink-0" />
          {ok}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- Input */

const BASE_CONTROL =
  'block w-full rounded-md border bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ' +
  'dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800';

const BORDE_OK = 'border-slate-300 focus:border-brand-500 dark:border-slate-700';
const BORDE_ERROR = 'border-red-400 focus:border-red-500 dark:border-red-700';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalido?: boolean;
  alineado?: 'izq' | 'der';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalido, alineado = 'izq', className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalido || undefined}
      className={cx(
        BASE_CONTROL,
        'h-9',
        invalido ? BORDE_ERROR : BORDE_OK,
        alineado === 'der' && 'text-right tabular',
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalido?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalido, className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalido || undefined}
      className={cx(BASE_CONTROL, 'py-2', invalido ? BORDE_ERROR : BORDE_OK, className)}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalido?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalido, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalido || undefined}
      className={cx(
        BASE_CONTROL,
        'h-9 appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        invalido ? BORDE_ERROR : BORDE_OK,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/* ---------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}): JSX.Element {
  return (
    <section className={cx('surface', padding && 'p-4 sm:p-5', className)}>{children}</section>
  );
}

export function CardHeader({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cx('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{titulo}</h2>
        {descripcion ? (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex shrink-0 items-center gap-2">{acciones}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Badge */

export type BadgeTono =
  | 'gris'
  | 'azul'
  | 'verde'
  | 'ambar'
  | 'rojo'
  | 'violeta'
  | 'contorno';

const TONOS: Record<BadgeTono, string> = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  azul: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-800',
  verde:
    'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
  ambar:
    'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  rojo: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
  violeta:
    'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800',
  contorno: 'bg-transparent text-slate-600 ring-slate-300 dark:text-slate-300 dark:ring-slate-600',
};

export function Badge({
  children,
  tono = 'gris',
  className,
  punto = false,
}: {
  children: ReactNode;
  tono?: BadgeTono;
  className?: string;
  punto?: boolean;
}): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONOS[tono],
        className,
      )}
    >
      {punto ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Badge del estado del comprobante. */
export function EstadoBadge({ estado }: { estado: string }): JSX.Element {
  const mapa: Record<string, { tono: BadgeTono; texto: string }> = {
    EMITIDA: { tono: 'verde', texto: 'Emitida' },
    RECHAZADA: { tono: 'rojo', texto: 'Rechazada' },
    BORRADOR: { tono: 'ambar', texto: 'Borrador' },
    ANULADA: { tono: 'gris', texto: 'Anulada' },
  };
  const cfg = mapa[estado] ?? { tono: 'gris' as BadgeTono, texto: estado };
  return (
    <Badge tono={cfg.tono} punto>
      {cfg.texto}
    </Badge>
  );
}

/* ----------------------------------------------------------- EmptyState */

export function EmptyState({
  titulo,
  descripcion,
  accion,
  icono,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  icono?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700',
        className,
      )}
    >
      <div className="mb-3 text-slate-400 dark:text-slate-600">
        {icono ?? <IconInfo className="h-8 w-8" />}
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{titulo}</p>
      {descripcion ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>
      ) : null}
      {accion ? <div className="mt-4">{accion}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Table */

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <div className="inline-block min-w-full align-middle">
        <table className={cx('min-w-full border-collapse text-sm', className)}>{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
  scope = 'col',
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  scope?: 'col' | 'row';
}): JSX.Element {
  return (
    <th
      scope={scope}
      className={cx(
        'border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}): JSX.Element {
  return (
    <td
      colSpan={colSpan}
      className={cx(
        'border-b border-slate-100 px-3 py-2.5 text-slate-700 dark:border-slate-800/70 dark:text-slate-300',
        align === 'right' && 'text-right tabular',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}): JSX.Element {
  return (
    <tr
      onClick={onClick}
      className={cx(
        'transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  );
}

/* --------------------------------------------------------------- Alert */

export function Alert({
  tono = 'azul',
  titulo,
  children,
  acciones,
  className,
}: {
  tono?: 'azul' | 'verde' | 'ambar' | 'rojo';
  titulo?: ReactNode;
  children?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}): JSX.Element {
  const estilos = {
    azul: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-100',
    verde:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100',
    ambar:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100',
    rojo: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100',
  } as const;

  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm', estilos[tono], className)}>
      {titulo ? <p className="font-semibold">{titulo}</p> : null}
      {children ? <div className={cx(titulo && 'mt-1', 'text-sm opacity-95')}>{children}</div> : null}
      {acciones ? <div className="mt-3 flex flex-wrap gap-2">{acciones}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Skeleton */

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cx('animate-pulse-soft rounded bg-slate-200 dark:bg-slate-800', className)}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------- Toggle */

export function Toggle({
  checked,
  onChange,
  label,
  descripcion,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  descripcion?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 select-none',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.15rem]' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {descripcion ? (
          <span className="block text-xs text-slate-500 dark:text-slate-400">{descripcion}</span>
        ) : null}
      </span>
    </label>
  );
}

/* ---------------------------------------------------------- PageHeader */

export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}): JSX.Element {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </header>
  );
}

/** Tecla para mostrar atajos. */
export function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return (
    <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </kbd>
  );
}
