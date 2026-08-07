/**
 * Catalogos de ARCA. Endpoint publico: el frontend los pide antes del login
 * para armar los combos de la pantalla de alta.
 */

import type { FastifyInstance } from 'fastify';

import {
  ALICUOTAS_IVA,
  CONCEPTOS,
  CONDICIONES_IVA_RECEPTOR,
  MONEDAS,
  TIPOS_COMPROBANTE,
  TIPOS_DOCUMENTO,
  TIPOS_TRIBUTO,
  letraDeComprobante,
} from '../domain/catalogs.js';

/**
 * Unidades de medida. En el modelo se guardan como texto libre, asi que el
 * catalogo es una sugerencia para la UI (no un id de ARCA).
 */
export const UNIDADES: Array<{ id: string; desc: string }> = [
  { id: 'unidad', desc: 'Unidades' },
  { id: 'hora', desc: 'Horas' },
  { id: 'dia', desc: 'Dias' },
  { id: 'mes', desc: 'Meses' },
  { id: 'kg', desc: 'Kilogramos' },
  { id: 'g', desc: 'Gramos' },
  { id: 'l', desc: 'Litros' },
  { id: 'm', desc: 'Metros' },
  { id: 'm2', desc: 'Metros cuadrados' },
  { id: 'm3', desc: 'Metros cubicos' },
  { id: 'km', desc: 'Kilometros' },
  { id: 'docena', desc: 'Docenas' },
  { id: 'pack', desc: 'Packs' },
  { id: 'servicio', desc: 'Servicios' },
];

/** Condiciones frente al IVA que puede tener una empresa emisora. */
export const CONDICIONES_IVA_EMISOR: Array<{ id: string; desc: string }> = [
  { id: 'RI', desc: 'Responsable Inscripto' },
  { id: 'MONOTRIBUTO', desc: 'Responsable Monotributo' },
  { id: 'EXENTO', desc: 'Sujeto Exento' },
];

export async function rutasCatalogs(app: FastifyInstance): Promise<void> {
  /** GET /api/catalogs - publico. */
  app.get('/catalogs', async () => ({
    tiposComprobante: TIPOS_COMPROBANTE.map((t) => ({
      ...t,
      letra: letraDeComprobante(t.id),
    })),
    tiposDocumento: TIPOS_DOCUMENTO,
    alicuotasIva: ALICUOTAS_IVA,
    condicionesIvaReceptor: CONDICIONES_IVA_RECEPTOR,
    condicionesIvaEmisor: CONDICIONES_IVA_EMISOR,
    conceptos: CONCEPTOS,
    monedas: MONEDAS,
    tiposTributo: TIPOS_TRIBUTO,
    unidades: UNIDADES,
  }));
}
