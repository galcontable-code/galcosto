/**
 * Padron A5 de ARCA (servicio `ws_sr_padron_a5`, operacion `getPersona_v2`).
 *
 * Sirve para precargar los datos del receptor con solo tipear el CUIT:
 * razon social, domicilio y —sobre todo— la condicion frente al IVA, que
 * desde la RG 5616 es obligatoria en todos los comprobantes.
 */

import { config } from '../config.js';
import type { ArcaEnvironment, ArcaPadronData, ArcaTicketAccess } from '../domain/arca-port.js';
import { ArcaError } from './errors.js';
import { arcaLog, asArray, asString, escapeXml, pick, soapCall } from './soap.js';

const NS_PADRON_A5 = 'http://a5.soap.ws.server.puc.sr/';

// ---------------------------------------------------------------------------
// CUIT
// ---------------------------------------------------------------------------

/** Pesos del algoritmo de digito verificador (modulo 11). */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja solo los digitos de un CUIT escrito con guiones o espacios. */
export function normalizarCuit(cuit: string | number): string {
  return String(cuit ?? '').replace(/\D/g, '');
}

/**
 * Valida un CUIT/CUIL argentino: 11 digitos y digito verificador modulo 11.
 */
export function validarCuit(cuit: string): boolean {
  const limpio = normalizarCuit(cuit);
  if (limpio.length !== 11) return false;
  // Descarta secuencias degeneradas tipo 00000000000.
  if (/^(\d)\1{10}$/.test(limpio)) return false;

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(limpio[i]) * (PESOS[i] as number);
  }
  const resto = suma % 11;
  const esperado = 11 - resto;
  const dv = Number(limpio[10]);

  if (esperado === 11) return dv === 0;
  // El 10 no se asigna: esos CUIT no existen.
  if (esperado === 10) return false;
  return dv === esperado;
}

/** Formatea 20111111112 como 20-11111111-2. */
export function formatearCuit(cuit: string | number): string {
  const limpio = normalizarCuit(cuit);
  if (limpio.length !== 11) return String(cuit ?? '');
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
}

/** Tipo de persona segun el prefijo del CUIT. */
export function tipoPersonaDeCuit(cuit: string): 'FISICA' | 'JURIDICA' {
  const prefijo = normalizarCuit(cuit).slice(0, 2);
  return ['30', '33', '34'].includes(prefijo) ? 'JURIDICA' : 'FISICA';
}

// ---------------------------------------------------------------------------
// Condicion frente al IVA
// ---------------------------------------------------------------------------

/** Id de impuesto de IVA en el padron. */
const IMPUESTO_IVA = 30;
/** Ids de los regimenes de monotributo. */
const IMPUESTOS_MONOTRIBUTO = new Set([20, 21, 24]);
/** IVA exento. */
const IMPUESTO_IVA_EXENTO = 32;

export interface ImpuestoPadron {
  id: number;
  desc: string;
  estado: string;
}

const esMonotributoDesc = (desc: string): boolean =>
  /monotributo|regimen simplificado/i.test(desc);

/**
 * Deduce la condicion frente al IVA (catalogo CONDICIONES_IVA_RECEPTOR) a
 * partir de los impuestos que el padron devuelve.
 *
 * Se evalua primero el monotributo porque un monotributista nunca esta
 * inscripto en IVA, y si no se puede determinar se asume consumidor final,
 * que es la opcion mas conservadora (comprobante clase B).
 */
export function inferirCondicionIva(
  impuestos: ImpuestoPadron[],
  esMonotributista: boolean,
): number {
  const activos = impuestos.filter(
    (i) => !i.estado || /activo|^ac$/i.test(i.estado) || i.estado.trim() === '',
  );
  const lista = activos.length > 0 ? activos : impuestos;

  if (esMonotributista || lista.some((i) => IMPUESTOS_MONOTRIBUTO.has(i.id) || esMonotributoDesc(i.desc))) {
    return 6; // Responsable Monotributo
  }
  if (lista.some((i) => i.id === IMPUESTO_IVA)) {
    return 1; // IVA Responsable Inscripto
  }
  if (lista.some((i) => i.id === IMPUESTO_IVA_EXENTO || /exent/i.test(i.desc))) {
    return 4; // IVA Sujeto Exento
  }
  return 5; // Consumidor Final
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

function endpoint(env: ArcaEnvironment): string {
  return config.arca.padron[env];
}

function textoNoNulo(valor: unknown): string | undefined {
  const texto = asString(valor);
  if (!texto || texto.toUpperCase() === 'NULL') return undefined;
  return texto;
}

/** Convierte el <personaReturn> del padron al contrato de la app. */
export function parsePersonaResponse(parsed: unknown, cuit: string): ArcaPadronData | null {
  const persona =
    pick(parsed, 'Envelope', 'Body', 'getPersona_v2Response', 'personaReturn') ??
    pick(parsed, 'Envelope', 'Body', 'personaReturn');
  if (!persona) return null;

  const errorConstancia = textoNoNulo(pick(persona, 'errorConstancia', 'error'));
  if (errorConstancia && /no existe|sin datos/i.test(errorConstancia)) return null;

  const generales = pick(persona, 'datosGenerales');
  if (!generales) return null;

  const razonSocialDirecta = textoNoNulo(pick(generales, 'razonSocial'));
  const apellido = textoNoNulo(pick(generales, 'apellido')) ?? '';
  const nombre = textoNoNulo(pick(generales, 'nombre')) ?? '';
  const razonSocial =
    razonSocialDirecta ?? `${apellido} ${nombre}`.trim() ?? '';

  const tipoPersonaBruto = asString(pick(generales, 'tipoPersona')).toUpperCase();
  const tipoPersona: 'FISICA' | 'JURIDICA' =
    tipoPersonaBruto === 'JURIDICA' ? 'JURIDICA' : tipoPersonaBruto === 'FISICA' ? 'FISICA' : tipoPersonaDeCuit(cuit);

  const domicilio = pick(generales, 'domicilioFiscal');

  const monotributo = pick(persona, 'datosMonotributo');
  const impuestos: ImpuestoPadron[] = [
    ...asArray(pick(persona, 'datosRegimenGeneral', 'impuesto')),
    ...asArray(pick(monotributo, 'impuesto')),
  ].map((i) => ({
    id: Number(asString(pick(i, 'idImpuesto'))) || 0,
    desc: asString(pick(i, 'descripcionImpuesto')),
    estado: asString(pick(i, 'estado')),
  }));

  const categoriaMono = textoNoNulo(pick(monotributo, 'categoriaMonotributo', 'descripcionCategoria'));
  const esMonotributista =
    monotributo !== undefined && monotributo !== null && monotributo !== ''
      ? true
      : Boolean(categoriaMono);

  return {
    cuit: normalizarCuit(cuit),
    razonSocial: razonSocial || `CUIT ${formatearCuit(cuit)}`,
    tipoPersona,
    estadoClave: textoNoNulo(pick(generales, 'estadoClave')) ?? 'DESCONOCIDO',
    domicilio: textoNoNulo(pick(domicilio, 'direccion')),
    localidad: textoNoNulo(pick(domicilio, 'localidad')),
    provincia: textoNoNulo(pick(domicilio, 'descripcionProvincia')),
    codPostal: textoNoNulo(pick(domicilio, 'codPostal')),
    condicionIvaReceptorId: inferirCondicionIva(impuestos, esMonotributista),
    esMonotributista,
    impuestos: impuestos.map((i) => i.desc).filter((d) => d !== ''),
  };
}

/**
 * Consulta el padron A5. Devuelve null si el CUIT no existe.
 * `ta` tiene que ser un ticket del servicio `ws_sr_padron_a5`.
 */
export async function consultarPadronA5(
  ta: ArcaTicketAccess,
  cuitRepresentada: string,
  cuitConsultado: string,
  env: ArcaEnvironment,
): Promise<ArcaPadronData | null> {
  const idPersona = normalizarCuit(cuitConsultado);
  if (!validarCuit(idPersona)) {
    throw ArcaError.rechazado(
      `El CUIT ${cuitConsultado} no es valido: revisá el digito verificador.`,
    );
  }

  const body =
    `    <a5:getPersona_v2 xmlns:a5="${NS_PADRON_A5}">\n` +
    `      <token>${escapeXml(ta.token)}</token>\n` +
    `      <sign>${escapeXml(ta.sign)}</sign>\n` +
    `      <cuitRepresentada>${normalizarCuit(cuitRepresentada)}</cuitRepresentada>\n` +
    `      <idPersona>${idPersona}</idPersona>\n` +
    '    </a5:getPersona_v2>';

  try {
    const res = await soapCall({
      url: endpoint(env),
      body,
      action: '',
      label: 'getPersona_v2',
      retries: 1,
    });
    return parsePersonaResponse(res.parsed, idPersona);
  } catch (err) {
    // El padron avisa "No existe persona con ese Id" como SOAP Fault.
    if (err instanceof ArcaError) {
      const texto = `${err.message} ${err.details.map((d) => d.msg).join(' ')}`;
      if (/no existe persona|sin datos|no se encontr/i.test(texto)) {
        arcaLog.debug(`Padron: el CUIT ${idPersona} no existe`);
        return null;
      }
    }
    throw err;
  }
}
