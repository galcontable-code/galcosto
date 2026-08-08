/**
 * Generacion del PDF del comprobante.
 *
 * El objetivo es que el impreso se parezca a una factura electronica argentina
 * real: encabezado partido con la letra en el recuadro central, datos del
 * emisor y del receptor, detalle, totales con el IVA discriminado solo cuando
 * corresponde (clase A y M), y al pie el QR obligatorio de ARCA con el CAE y
 * su vencimiento.
 */

import PDFDocument from 'pdfkit';

import {
  aFechaIso,
  formatearCuit,
  formatearCantidad,
  formatearDocumento,
  formatearFecha,
  formatearImporte,
  formatearNumeroComprobante,
} from '../lib/format.js';
import {
  ALICUOTAS_IVA,
  descripcionComprobante,
  descripcionCondicionIva,
  discriminaIva,
  esNotaDeCredito,
  esNotaDeDebito,
  letraDeComprobante,
  requierePeriodoServicio,
} from '../domain/catalogs.js';
import { cargarComprobante, esComprobanteDePrueba, type InvoiceCompleto } from './invoice-service.js';
import { renderQrPng } from '../arca/index.js';

/* -------------------------------------------------------------------------- */
/* Constantes de maquetacion                                                   */
/* -------------------------------------------------------------------------- */

const MARGEN = 30;
const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;
const X0 = MARGEN;
const X1 = MARGEN + ANCHO_UTIL;

const GRIS = '#555555';
const GRIS_CLARO = '#e8e8e8';
const NEGRO = '#111111';
const LINEA = '#666666';

const CONDICION_EMISOR: Record<string, string> = {
  RI: 'IVA Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributo',
  EXENTO: 'IVA Sujeto Exento',
};

/**
 * Codigo de comprobante que va impreso debajo de la letra.
 *
 * Se escribe con dos digitos ("COD. 01" para Factura A, "COD. 06" para la B,
 * "COD. 11" para la C). Los comprobantes MiPyME tienen codigos de tres
 * digitos propios (201, 206, 211) y se imprimen tal cual: por eso el relleno
 * es a un minimo de dos, no a tres fijos.
 */
export function codigoComprobante(cbteTipo: number): string {
  return `COD. ${String(cbteTipo).padStart(2, '0')}`;
}

function titulaComprobante(cbteTipo: number): string {
  if (esNotaDeCredito(cbteTipo)) return 'NOTA DE CREDITO';
  if (esNotaDeDebito(cbteTipo)) return 'NOTA DE DEBITO';
  return 'FACTURA';
}

function alicuotaDe(ivaId: number): number {
  return ALICUOTAS_IVA.find((a) => a.id === ivaId)?.rate ?? 0;
}

function descripcionAlicuota(ivaId: number): string {
  return ALICUOTAS_IVA.find((a) => a.id === ivaId)?.desc ?? `${alicuotaDe(ivaId)}%`;
}

/* -------------------------------------------------------------------------- */
/* API                                                                         */
/* -------------------------------------------------------------------------- */

export async function generateInvoicePdf(
  invoiceId: string,
  studioId: string,
): Promise<Buffer> {
  const comprobante = await cargarComprobante(invoiceId, studioId);
  return renderizar(comprobante);
}

/* -------------------------------------------------------------------------- */
/* Render                                                                      */
/* -------------------------------------------------------------------------- */

type Doc = PDFKit.PDFDocument;

async function renderizar(inv: InvoiceCompleto): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGEN,
    bufferPages: true,
    info: {
      Title: `${descripcionComprobante(inv.cbteTipo)} ${formatearNumeroComprobante(inv.ptoVta, inv.cbteNro)}`,
      Author: inv.company.razonSocial,
      Subject: 'Comprobante electronico ARCA',
    },
  });

  const trozos: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => trozos.push(chunk));
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  const esPrueba = esComprobanteDePrueba(inv.environment);

  // El QR se prepara antes de dibujar: si falla, el PDF sale igual sin QR.
  let qrPng: Buffer | null = null;
  if (inv.qrPayload) {
    try {
      qrPng = await renderQrPng(inv.qrPayload);
    } catch {
      qrPng = null;
    }
  }

  if (esPrueba) marcaDeAgua(doc);

  let y = encabezado(doc, inv);
  y = bloqueReceptor(doc, inv, y);
  y = bloquePeriodo(doc, inv, y);
  y = tablaItems(doc, inv, y, esPrueba);
  y = bloqueTotales(doc, inv, y);
  pie(doc, inv, qrPng, esPrueba);

  doc.end();
  return terminado;
}

/* -------------------------------------------------------------------------- */
/* Encabezado                                                                  */
/* -------------------------------------------------------------------------- */

function encabezado(doc: Doc, inv: InvoiceCompleto): number {
  const empresa = inv.company;
  const alto = 128;
  const yTop = MARGEN;
  const mitad = X0 + ANCHO_UTIL / 2;

  // Recuadro general partido al medio.
  doc.lineWidth(1).strokeColor(LINEA);
  doc.rect(X0, yTop, ANCHO_UTIL, alto).stroke();
  doc.moveTo(mitad, yTop).lineTo(mitad, yTop + alto).stroke();

  // Recuadro central con la letra.
  const anchoLetra = 54;
  const altoLetra = 46;
  const xLetra = mitad - anchoLetra / 2;
  doc.rect(xLetra, yTop - 12, anchoLetra, altoLetra).fillAndStroke('#ffffff', LINEA);
  doc
    .fillColor(NEGRO)
    .font('Helvetica-Bold')
    .fontSize(28)
    .text(letraDeComprobante(inv.cbteTipo), xLetra, yTop - 6, {
      width: anchoLetra,
      align: 'center',
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor(NEGRO)
    .text(codigoComprobante(inv.cbteTipo), xLetra, yTop + 25, {
      width: anchoLetra,
      align: 'center',
      lineBreak: false,
    });

  /* ---------------------------- Columna izquierda -------------------------- */
  const xIzq = X0 + 14;
  const anchoIzq = ANCHO_UTIL / 2 - 40;
  let yIzq = yTop + 40;

  const logo = decodificarLogo(empresa.logoDataUrl);
  if (logo) {
    try {
      doc.image(logo, xIzq, yTop + 8, { fit: [110, 28] });
    } catch {
      // Un logo corrupto no puede romper el comprobante.
    }
  }

  doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(14);
  doc.text(empresa.razonSocial.toUpperCase(), xIzq, yIzq, {
    width: anchoIzq,
    lineBreak: true,
  });
  yIzq = doc.y + 4;

  if (empresa.nombreFantasia) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(GRIS);
    doc.text(empresa.nombreFantasia, xIzq, yIzq, { width: anchoIzq });
    yIzq = doc.y + 2;
  }

  doc.font('Helvetica').fontSize(8.5).fillColor(NEGRO);
  const domicilio = [empresa.domicilio, empresa.localidad, empresa.provincia]
    .filter(Boolean)
    .join(' - ');
  if (domicilio) {
    doc.text(`Domicilio: ${domicilio}`, xIzq, yIzq, { width: anchoIzq });
    yIzq = doc.y + 1;
  }
  doc.text(
    `Condicion frente al IVA: ${CONDICION_EMISOR[empresa.condicionIva] ?? empresa.condicionIva}`,
    xIzq,
    yIzq,
    { width: anchoIzq },
  );

  /* ----------------------------- Columna derecha --------------------------- */
  const xDer = mitad + 14;
  const anchoDer = ANCHO_UTIL / 2 - 28;
  let yDer = yTop + 40;

  doc.font('Helvetica-Bold').fontSize(15).fillColor(NEGRO);
  doc.text(titulaComprobante(inv.cbteTipo), xDer, yDer, {
    width: anchoDer,
    lineBreak: false,
  });
  yDer += 20;

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(
    `Punto de Venta: ${String(inv.ptoVta).padStart(4, '0')}    Comp. Nro: ${String(
      inv.cbteNro ?? 0,
    ).padStart(8, '0')}`,
    xDer,
    yDer,
    { width: anchoDer, lineBreak: false },
  );
  yDer += 13;

  doc.font('Helvetica').fontSize(8.5);
  const filas: Array<[string, string]> = [
    ['Fecha de Emision:', formatearFecha(inv.fechaCbte)],
    ['CUIT:', formatearCuit(empresa.cuit)],
    ['Ingresos Brutos:', empresa.ingresosBrutos ?? '-'],
    ['Inicio de Actividades:', formatearFecha(empresa.inicioActividades)],
  ];
  for (const [etiqueta, valor] of filas) {
    doc.font('Helvetica-Bold').text(etiqueta, xDer, yDer, { width: 110, lineBreak: false });
    doc.font('Helvetica').text(valor, xDer + 112, yDer, {
      width: anchoDer - 112,
      lineBreak: false,
    });
    yDer += 12;
  }

  return yTop + alto + 8;
}

/* -------------------------------------------------------------------------- */
/* Receptor                                                                    */
/* -------------------------------------------------------------------------- */

function bloqueReceptor(doc: Doc, inv: InvoiceCompleto, yTop: number): number {
  const alto = 56;
  doc.lineWidth(1).strokeColor(LINEA).rect(X0, yTop, ANCHO_UTIL, alto).stroke();

  const col1 = X0 + 10;
  const col2 = X0 + ANCHO_UTIL / 2 + 10;
  const anchoCol = ANCHO_UTIL / 2 - 20;

  const razonSocial =
    inv.receptorRazonSocial ?? inv.customer?.razonSocial ?? 'Consumidor Final';
  const domicilio =
    inv.receptorDomicilio ??
    [inv.customer?.domicilio, inv.customer?.localidad, inv.customer?.provincia]
      .filter(Boolean)
      .join(' - ');

  const etiqueta = (texto: string, x: number, y: number): void => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS);
    doc.text(texto, x, y, { width: anchoCol, lineBreak: false });
  };
  const valor = (texto: string, x: number, y: number): void => {
    doc.font('Helvetica').fontSize(9).fillColor(NEGRO);
    doc.text(texto, x, y, { width: anchoCol, lineBreak: false, ellipsis: true });
  };

  etiqueta('Razon Social / Apellido y Nombre:', col1, yTop + 7);
  valor(razonSocial, col1, yTop + 18);

  etiqueta('Domicilio:', col1, yTop + 33);
  valor(domicilio || '-', col1, yTop + 43);

  etiqueta(`${docTipoEtiqueta(inv.docTipo)}:`, col2, yTop + 7);
  valor(formatearDocumento(inv.docTipo, inv.docNro), col2, yTop + 18);

  etiqueta('Condicion frente al IVA:', col2, yTop + 33);
  valor(descripcionCondicionIva(inv.condicionIvaReceptorId), col2, yTop + 43);

  return yTop + alto + 6;
}

function docTipoEtiqueta(docTipo: number): string {
  if (docTipo === 80) return 'CUIT';
  if (docTipo === 86) return 'CUIL';
  if (docTipo === 96) return 'DNI';
  if (docTipo === 99) return 'Documento';
  return 'Documento';
}

/* -------------------------------------------------------------------------- */
/* Periodo facturado                                                           */
/* -------------------------------------------------------------------------- */

function bloquePeriodo(doc: Doc, inv: InvoiceCompleto, yTop: number): number {
  if (!requierePeriodoServicio(inv.concepto)) return yTop;

  const alto = 22;
  doc.lineWidth(1).strokeColor(LINEA).rect(X0, yTop, ANCHO_UTIL, alto).stroke();

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NEGRO);
  doc.text('Periodo Facturado Desde:', X0 + 10, yTop + 7, { width: 130, lineBreak: false });
  doc.font('Helvetica').text(formatearFecha(inv.fchServDesde), X0 + 140, yTop + 7, {
    width: 70,
    lineBreak: false,
  });

  doc.font('Helvetica-Bold').text('Hasta:', X0 + 215, yTop + 7, { width: 40, lineBreak: false });
  doc.font('Helvetica').text(formatearFecha(inv.fchServHasta), X0 + 252, yTop + 7, {
    width: 70,
    lineBreak: false,
  });

  doc.font('Helvetica-Bold').text('Vto. para el pago:', X0 + 330, yTop + 7, {
    width: 100,
    lineBreak: false,
  });
  doc.font('Helvetica').text(formatearFecha(inv.fchVtoPago), X0 + 428, yTop + 7, {
    width: 80,
    lineBreak: false,
  });

  return yTop + alto + 6;
}

/* -------------------------------------------------------------------------- */
/* Tabla de items                                                              */
/* -------------------------------------------------------------------------- */

interface Columna {
  titulo: string;
  ancho: number;
  align: 'left' | 'right' | 'center';
}

function columnasDe(cbteTipo: number): Columna[] {
  const conIva = discriminaIva(cbteTipo);
  const fijas: Columna[] = conIva
    ? [
        { titulo: 'Codigo', ancho: 46, align: 'left' },
        { titulo: 'Descripcion', ancho: 0, align: 'left' },
        { titulo: 'Cant.', ancho: 40, align: 'right' },
        { titulo: 'U. med.', ancho: 42, align: 'center' },
        { titulo: 'P. Unit.', ancho: 64, align: 'right' },
        { titulo: '% Bonif', ancho: 38, align: 'right' },
        { titulo: 'Alic. IVA', ancho: 42, align: 'right' },
        { titulo: 'Subtotal', ancho: 68, align: 'right' },
      ]
    : [
        { titulo: 'Codigo', ancho: 50, align: 'left' },
        { titulo: 'Descripcion', ancho: 0, align: 'left' },
        { titulo: 'Cant.', ancho: 44, align: 'right' },
        { titulo: 'U. med.', ancho: 46, align: 'center' },
        { titulo: 'P. Unit.', ancho: 72, align: 'right' },
        { titulo: '% Bonif', ancho: 44, align: 'right' },
        { titulo: 'Subtotal', ancho: 76, align: 'right' },
      ];

  const usadas = fijas.reduce((s, c) => s + c.ancho, 0);
  const flexible = fijas.find((c) => c.ancho === 0);
  if (flexible) flexible.ancho = ANCHO_UTIL - usadas;
  return fijas;
}

const ALTO_FILA = 15;
const Y_LIMITE = ALTO_PAGINA - 250;

function dibujarCabeceraTabla(doc: Doc, columnas: Columna[], y: number): number {
  const alto = 18;
  doc.rect(X0, y, ANCHO_UTIL, alto).fillAndStroke(GRIS_CLARO, LINEA);
  doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(7.5);

  let x = X0;
  for (const col of columnas) {
    doc.text(col.titulo, x + 4, y + 6, {
      width: col.ancho - 8,
      align: col.align,
      lineBreak: false,
    });
    x += col.ancho;
  }
  return y + alto;
}

function tablaItems(
  doc: Doc,
  inv: InvoiceCompleto,
  yTop: number,
  esPrueba: boolean,
): number {
  const columnas = columnasDe(inv.cbteTipo);
  const conIva = discriminaIva(inv.cbteTipo);
  let y = dibujarCabeceraTabla(doc, columnas, yTop);
  const yInicioCuerpo = y;

  doc.font('Helvetica').fontSize(8).fillColor(NEGRO);

  for (const item of inv.items) {
    if (y + ALTO_FILA > Y_LIMITE) {
      // Cierra el cuerpo de esta pagina y sigue en la siguiente.
      doc.lineWidth(0.5).strokeColor(LINEA).rect(X0, yInicioCuerpo, ANCHO_UTIL, y - yInicioCuerpo).stroke();
      doc.addPage();
      if (esPrueba) marcaDeAgua(doc);
      y = dibujarCabeceraTabla(doc, columnas, MARGEN);
      doc.font('Helvetica').fontSize(8).fillColor(NEGRO);
    }

    const factor = item.cantidad * (1 - item.bonificacion / 100);
    // En A/M se imprime el precio neto; en B/C el precio final con IVA.
    const precioUnitario = conIva
      ? item.precioUnitario
      : factor > 0
        ? item.subtotalConIva / factor
        : item.precioUnitario;
    const subtotal = conIva ? item.subtotalNeto : item.subtotalConIva;

    const celdas: string[] = conIva
      ? [
          codigoItem(item.productId, item.orden),
          item.descripcion,
          formatearCantidad(item.cantidad),
          item.unidad,
          formatearImporte(precioUnitario),
          formatearCantidad(item.bonificacion),
          descripcionAlicuota(item.ivaId),
          formatearImporte(subtotal),
        ]
      : [
          codigoItem(item.productId, item.orden),
          item.descripcion,
          formatearCantidad(item.cantidad),
          item.unidad,
          formatearImporte(precioUnitario),
          formatearCantidad(item.bonificacion),
          formatearImporte(subtotal),
        ];

    let x = X0;
    for (let i = 0; i < columnas.length; i += 1) {
      const col = columnas[i] as Columna;
      doc.text(celdas[i] ?? '', x + 4, y + 4, {
        width: col.ancho - 8,
        align: col.align,
        lineBreak: false,
        ellipsis: true,
      });
      x += col.ancho;
    }
    y += ALTO_FILA;
  }

  doc
    .lineWidth(0.5)
    .strokeColor(LINEA)
    .rect(X0, yInicioCuerpo, ANCHO_UTIL, Math.max(y - yInicioCuerpo, ALTO_FILA))
    .stroke();

  return y + 8;
}

function codigoItem(productId: string | null, orden: number): string {
  if (!productId) return String(orden + 1).padStart(3, '0');
  return productId.slice(-6).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Totales                                                                     */
/* -------------------------------------------------------------------------- */

function bloqueTotales(doc: Doc, inv: InvoiceCompleto, yTop: number): number {
  const conIva = discriminaIva(inv.cbteTipo);

  const lineas: Array<[string, string, boolean]> = [];

  if (conIva) {
    lineas.push(['Importe Neto Gravado:', `$ ${formatearImporte(inv.impNeto)}`, false]);
    for (const linea of ivaPorAlicuota(inv)) {
      lineas.push([`IVA ${descripcionAlicuota(linea.ivaId)}:`, `$ ${formatearImporte(linea.importe)}`, false]);
    }
  } else {
    lineas.push(['Subtotal:', `$ ${formatearImporte(inv.impNeto + inv.impIVA)}`, false]);
  }

  if (inv.impOpEx > 0) {
    lineas.push(['Importe Operaciones Exentas:', `$ ${formatearImporte(inv.impOpEx)}`, false]);
  }
  if (inv.impTotConc > 0) {
    lineas.push(['Importe No Gravado:', `$ ${formatearImporte(inv.impTotConc)}`, false]);
  }

  for (const t of inv.tributos) {
    lineas.push([`${t.descripcion}:`, `$ ${formatearImporte(t.importe)}`, false]);
  }
  if (inv.tributos.length === 0 && inv.impTrib > 0) {
    lineas.push(['Otros Tributos:', `$ ${formatearImporte(inv.impTrib)}`, false]);
  }

  lineas.push(['TOTAL:', `$ ${formatearImporte(inv.impTotal)}`, true]);

  const anchoCaja = 260;
  const x = X1 - anchoCaja;
  const alto = lineas.length * 14 + 10;

  let y = yTop;
  if (y + alto > Y_LIMITE + 120) {
    doc.addPage();
    y = MARGEN;
  }

  doc.lineWidth(1).strokeColor(LINEA).rect(x, y, anchoCaja, alto).stroke();

  let yLinea = y + 6;
  for (const [etiqueta, valor, destacado] of lineas) {
    if (destacado) {
      doc.moveTo(x, yLinea - 3).lineTo(x + anchoCaja, yLinea - 3).lineWidth(0.5).stroke();
    }
    doc
      .font(destacado ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(destacado ? 11 : 8.5)
      .fillColor(NEGRO);
    doc.text(etiqueta, x + 8, yLinea + (destacado ? 1 : 0), {
      width: anchoCaja / 2 + 20,
      lineBreak: false,
    });
    doc.text(valor, x + anchoCaja / 2 + 24, yLinea + (destacado ? 1 : 0), {
      width: anchoCaja / 2 - 32,
      align: 'right',
      lineBreak: false,
    });
    yLinea += destacado ? 16 : 14;
  }

  // Observaciones libres al pie del detalle.
  if (inv.observaciones) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS);
    doc.text('Observaciones:', X0, yTop + 4, { width: 240, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(NEGRO);
    doc.text(inv.observaciones, X0, yTop + 16, { width: X1 - anchoCaja - X0 - 12, height: alto });
  }

  return y + alto + 10;
}

interface LineaIva {
  ivaId: number;
  base: number;
  importe: number;
}

function ivaPorAlicuota(inv: InvoiceCompleto): LineaIva[] {
  const mapa = new Map<number, LineaIva>();
  for (const item of inv.items) {
    const actual = mapa.get(item.ivaId) ?? { ivaId: item.ivaId, base: 0, importe: 0 };
    actual.base = Math.round((actual.base + item.subtotalNeto) * 100) / 100;
    actual.importe = Math.round((actual.importe + item.importeIva) * 100) / 100;
    mapa.set(item.ivaId, actual);
  }
  return [...mapa.values()].sort((a, b) => alicuotaDe(a.ivaId) - alicuotaDe(b.ivaId));
}

/* -------------------------------------------------------------------------- */
/* Pie: QR + CAE                                                               */
/* -------------------------------------------------------------------------- */

function pie(doc: Doc, inv: InvoiceCompleto, qrPng: Buffer | null, esPrueba: boolean): void {
  const altoPie = 108;
  const y = ALTO_PAGINA - MARGEN - altoPie;

  doc.lineWidth(1).strokeColor(LINEA).rect(X0, y, ANCHO_UTIL, altoPie).stroke();

  const ladoQr = 86;
  if (qrPng) {
    try {
      doc.image(qrPng, X0 + 10, y + 11, { fit: [ladoQr, ladoQr] });
    } catch {
      // sin QR
    }
  } else {
    doc.font('Helvetica').fontSize(7).fillColor(GRIS);
    doc.text('Sin QR: el comprobante todavia no fue autorizado por ARCA', X0 + 10, y + 40, {
      width: ladoQr + 20,
      align: 'center',
    });
  }

  const xTexto = X0 + ladoQr + 28;
  const anchoTexto = ANCHO_UTIL - ladoQr - 44;

  if (inv.cae) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NEGRO);
    doc.text(`CAE Nro: ${inv.cae}`, xTexto, y + 14, { width: anchoTexto, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Fecha de Vto. de CAE: ${formatearFecha(inv.caeVto)}`, xTexto, y + 32, {
      width: anchoTexto,
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(7.5).fillColor(GRIS);
    doc.text(
      'Comprobante Autorizado. Esta Administracion Federal no se responsabiliza por los datos ingresados en el detalle de la operacion.',
      xTexto,
      y + 50,
      { width: anchoTexto },
    );
  } else {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#b00020');
    doc.text(`Comprobante en estado ${inv.estado} - SIN CAE`, xTexto, y + 20, {
      width: anchoTexto,
      lineBreak: false,
    });
    doc.font('Helvetica').fontSize(8).fillColor(GRIS);
    doc.text(
      'Este documento no fue autorizado por ARCA y no tiene validez fiscal.',
      xTexto,
      y + 38,
      { width: anchoTexto },
    );
  }

  doc.font('Helvetica').fontSize(6.5).fillColor(GRIS);
  const entorno = esPrueba
    ? `Entorno ${inv.environment === 'PROD' ? 'PRODUCCION (demo)' : 'HOMOLOGACION'} - sin validez fiscal`
    : 'Entorno PRODUCCION';
  doc.text(
    `${entorno}  |  Generado por Galcosto  |  ${aFechaIso(new Date())}`,
    X0 + 10,
    y + altoPie - 12,
    { width: ANCHO_UTIL - 20, lineBreak: false },
  );
}

/* -------------------------------------------------------------------------- */
/* Marca de agua                                                               */
/* -------------------------------------------------------------------------- */

function marcaDeAgua(doc: Doc): void {
  doc.save();
  doc.rotate(-32, { origin: [ANCHO_PAGINA / 2, ALTO_PAGINA / 2] });
  doc.font('Helvetica-Bold').fontSize(30).fillColor('#d32f2f').fillOpacity(0.12);
  doc.text('COMPROBANTE DE PRUEBA', 0, ALTO_PAGINA / 2 - 46, {
    width: ANCHO_PAGINA,
    align: 'center',
    lineBreak: false,
  });
  doc.fontSize(24);
  doc.text('SIN VALIDEZ FISCAL', 0, ALTO_PAGINA / 2 + 2, {
    width: ANCHO_PAGINA,
    align: 'center',
    lineBreak: false,
  });
  doc.fillOpacity(1);
  doc.restore();
  doc.fillColor(NEGRO);
}

/* -------------------------------------------------------------------------- */
/* Logo                                                                        */
/* -------------------------------------------------------------------------- */

function decodificarLogo(dataUrl: string | null): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m || !m[2]) return null;
  try {
    return Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  } catch {
    return null;
  }
}
