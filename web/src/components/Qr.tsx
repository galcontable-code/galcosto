import { useState } from 'react';
import { IconQr } from './Icons';
import { cx } from './ui';

/**
 * QR obligatorio del comprobante.
 *
 * El backend devuelve la URL del QR (`qrUrl`). Si esa URL se puede pintar como
 * imagen la mostramos; si no, dejamos el acceso al verificador de ARCA para
 * que el dato nunca se pierda.
 */
export function Qr({
  url,
  tamano = 132,
  className,
}: {
  url?: string | null;
  tamano?: number;
  className?: string;
}): JSX.Element {
  const [falloImagen, setFalloImagen] = useState(false);

  if (!url) {
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

  return (
    <figure className={cx('flex flex-col items-center gap-1.5', className)}>
      {falloImagen ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white p-3 text-center text-[11px] font-medium text-brand-700 transition hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:text-brand-300"
          style={{ width: tamano, height: tamano }}
        >
          <IconQr className="h-8 w-8" />
          Verificar en ARCA
        </a>
      ) : (
        <img
          src={url}
          alt="Código QR del comprobante, para verificarlo en ARCA"
          width={tamano}
          height={tamano}
          onError={() => setFalloImagen(true)}
          className="rounded-lg border border-slate-200 bg-white p-1.5 dark:border-slate-700"
          style={{ width: tamano, height: tamano }}
        />
      )}
      <figcaption className="text-[10px] uppercase tracking-wide text-slate-400">
        QR ARCA
      </figcaption>
    </figure>
  );
}
