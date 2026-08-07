/**
 * Iconos SVG dibujados a mano (sin librerías).
 * Todos heredan `currentColor` y aceptan className.
 */
import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: Props): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconInicio = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Base>
);

export const IconFacturar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
    <circle cx="12" cy="12" r="9.2" strokeOpacity="0.35" />
  </Base>
);

export const IconComprobantes = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 13h7M8.5 16.5h4.5" />
  </Base>
);

export const IconClientes = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17.5 14.6A5.5 5.5 0 0 1 20.5 20" />
  </Base>
);

export const IconProductos = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M20.5 8.2 12 3.4 3.5 8.2v7.6L12 20.6l8.5-4.8V8.2Z" />
    <path d="m3.7 8.1 8.3 4.6 8.3-4.6M12 12.7v7.9" />
  </Base>
);

export const IconEmpresas = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
    <path d="M14 10h5a1 1 0 0 1 1 1v10M3 21h18" />
    <path d="M7 8h3M7 12h3M7 16h3M17 14h0M17 17.5h0" />
  </Base>
);

export const IconConfiguracion = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Base>
);

export const IconBuscar = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Base>
);

export const IconDescargar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 17.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1.5" />
  </Base>
);

export const IconOjo = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Base>
);

export const IconEditar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Base>
);

export const IconBorrar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
    <path d="M6.5 6.5 7.4 20a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.9-13.5" />
    <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
  </Base>
);

export const IconMas = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconCerrar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconCheck = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const IconAlerta = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4.2M12 17.2h0" />
  </Base>
);

export const IconInfo = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8h0" />
  </Base>
);

export const IconFlechaDer = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);

export const IconFlechaIzq = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Base>
);

export const IconChevron = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const IconMenu = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const IconSol = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

export const IconLuna = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5a8.5 8.5 0 1 0 10.9 10.9Z" />
  </Base>
);

export const IconRayo = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
  </Base>
);

export const IconSalir = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 8 6 12l4 4M6 12h9" />
  </Base>
);

export const IconCertificado = (p: Props): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="9.5" r="5" />
    <path d="m8.5 13.8-1 7 4.5-2.4 4.5 2.4-1-7" />
    <path d="m10 9.5 1.5 1.5L14.5 8" />
  </Base>
);

export const IconEnchufe = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8Z" />
    <path d="M12 16.5V21" />
  </Base>
);

export const IconReintentar = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 5v6h-6" />
  </Base>
);

export const IconNotaCredito = (p: Props): JSX.Element => (
  <Base {...p}>
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 15h7" />
  </Base>
);

export const IconQr = (p: Props): JSX.Element => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
    <path d="M14.5 14.5h2.5v2.5h-2.5zM20.5 14.5v2.5M14.5 20.5h6" />
  </Base>
);

export const IconTeclado = (p: Props): JSX.Element => (
  <Base {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M9.5 13h6.5" />
  </Base>
);
