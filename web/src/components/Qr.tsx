import { useEffect, useState } from 'react';
import { IconQr } from './Icons';
import { cx } from './ui';
import { api } from '../lib/api';

/**
 * QR obligatorio del comprobante.
 *
 * `url` es lo que el codigo QR tiene que *codificar*: el verificador de ARCA
 * (`afip.gob.ar/fe/qr/?p=...`). No es una imagen — pedirla como tal fallaria
 * y encima le mostraria los datos del comprobante a un tercero. El PNG lo
 * renderiza nuestra API a partir de ese mismo dato, y se descarga con el
 * token de sesion.
 *
 * Si el comprobante todavia no tiene QR, o la descarga falla, queda el enlace
 * al verificador para que el dato nunca se pierda.
 */
export function Qr({
  invoiceId,
  url,
  tamano = 132,
  className,
}: {
  /** Comprobante del que traer el PNG. Sin esto solo se muestra el enlace. */
  invoiceId?: string | null;
  /** URL del verificador de ARCA, para el enlace de respaldo. */
  url?: string | null;
  tamano?: number;
  className?: string;
}): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;
    let anulado = false;
    let objectUrl: string | null = null;

    api
      .invoiceQr(invoiceId)
      .then((b) => {
        if (anulado) return;
        objectUrl = URL.createObjectURL(b);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!anulado) setFallo(true);
      });

    return () => {
      anulado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [invoiceId]);

  if (!url && !invoiceId) {
    return (
      <div
        className={cx(
          'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 p-3 text-center text-[11px] text-slate-400 dark:border-slate-700',
          className,
        )}
        style={{ width: tamano, height: tamano }}
      >
        <IconQr className="h-6 w-6" />
        Sin QR
      </div>
    );
  }

  const mostrarImagen = src && !fallo;

  return (
    <figure className={cx('flex flex-col items-center gap-1.5', className)}>
      {mostrarImagen ? (
        <img
          src={src}
          alt="Codigo QR del comprobante, para verificarlo en ARCA"
          width={tamano}
          height={tamano}
          className="rounded-lg border border-slate-200 bg-white p-1.5 dark:border-slate-700"
          style={{ width: tamano, height: tamano }}
        />
      ) : url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-3 text-center text-[11px] font-medium text-brand-700 transition hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-brand-300"
          style={{ width: tamano, height: tamano }}
        >
          <IconQr className="h-8 w-8" />
          {fallo ? 'Verificar en ARCA' : 'Generando QR...'}
        </a>
      ) : (
        <div
          className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700"
          style={{ width: tamano, height: tamano }}
        >
          <IconQr className="h-6 w-6 text-slate-400" />
        </div>
      )}
      <figcaption className="text-[10px] uppercase tracking-wide text-slate-400">QR ARCA</figcaption>
    </figure>
  );
}
