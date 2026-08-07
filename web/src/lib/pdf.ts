import { api } from './api';

/**
 * Descarga el PDF de un comprobante.
 *
 * El endpoint requiere el token, así que no alcanza con un `<a href>`: se
 * baja como blob y se dispara la descarga con un object URL temporal.
 */
export async function descargarPdf(invoiceId: string, nombre: string): Promise<void> {
  const blob = await api.invoicePdf(invoiceId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre.replace(/[^\w.-]+/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Damos tiempo a que el navegador tome el blob antes de liberarlo.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Abre el PDF en una pestaña nueva. */
export async function abrirPdf(invoiceId: string): Promise<void> {
  const blob = await api.invoicePdf(invoiceId);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
