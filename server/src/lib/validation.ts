/**
 * Esquemas Zod de todos los bodies y querystrings de docs/API.md, mas las
 * validaciones de negocio que ARCA exige antes de otorgar un CAE.
 *
 * Todos los mensajes estan en espanol porque se muestran tal cual al usuario.
 */

import { z } from 'zod';

import {
  ALICUOTAS_IVA,
  CONDICIONES_IVA_RECEPTOR,
  TIPOS_COMPROBANTE,
  TIPOS_DOCUMENTO,
  TIPOS_TRIBUTO,
  esNotaDeCredito,
  esNotaDeDebito,
  letraDeComprobante,
  requierePeriodoServicio,
} from '../domain/catalogs.js';
import { validarCuit } from '../arca/index.js';

/* -------------------------------------------------------------------------- */
/* Primitivas reutilizables                                                    */
/* -------------------------------------------------------------------------- */

const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const fechaIso = z
  .string()
  .regex(RE_FECHA_ISO, 'La fecha debe tener el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime()), {
    message: 'La fecha no existe en el calendario',
  });

export const idSchema = z.string().trim().min(1, 'El identificador es obligatorio');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'El email es obligatorio')
  .email('El email no tiene un formato valido');

export const passwordSchema = z
  .string()
  .min(8, 'La contrasena debe tener al menos 8 caracteres')
  .max(128, 'La contrasena es demasiado larga');

const idsIva = ALICUOTAS_IVA.map((a) => a.id);
const idsDoc = TIPOS_DOCUMENTO.map((d) => d.id);
const idsCondicionIva = CONDICIONES_IVA_RECEPTOR.map((c) => c.id);
const idsTributo = TIPOS_TRIBUTO.map((t) => t.id);
const idsComprobante = TIPOS_COMPROBANTE.map((t) => t.id);

export const ivaIdSchema = z
  .number()
  .int()
  .refine((v) => idsIva.includes(v), {
    message: `Alicuota de IVA desconocida. Valores validos: ${idsIva.join(', ')}`,
  });

export const docTipoSchema = z
  .number()
  .int()
  .refine((v) => idsDoc.includes(v), { message: 'Tipo de documento desconocido' });

export const condicionIvaReceptorSchema = z
  .number()
  .int()
  .refine((v) => idsCondicionIva.includes(v), {
    message: 'Condicion frente al IVA del receptor desconocida',
  });

export const cbteTipoSchema = z
  .number()
  .int()
  .refine((v) => idsComprobante.includes(v), { message: 'Tipo de comprobante desconocido' });

export const conceptoSchema = z
  .number()
  .int()
  .refine((v) => v === 1 || v === 2 || v === 3, {
    message: 'El concepto debe ser 1 (Productos), 2 (Servicios) o 3 (Productos y Servicios)',
  });

export const condicionIvaEmisorSchema = z.enum(['RI', 'MONOTRIBUTO', 'EXENTO'], {
  errorMap: () => ({
    message: 'La condicion frente al IVA debe ser RI, MONOTRIBUTO o EXENTO',
  }),
});

export const environmentSchema = z.enum(['HOMO', 'PROD'], {
  errorMap: () => ({ message: 'El entorno debe ser HOMO o PROD' }),
});

/** CUIT: 11 digitos con digito verificador correcto. */
export const cuitSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 11, { message: 'El CUIT debe tener 11 digitos' })
  .refine((v) => validarCuit(v), {
    message: 'El CUIT no es valido: el digito verificador no coincide',
  });

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `El texto no puede superar los ${max} caracteres`)
    .optional()
    .nullable();

/** Booleano que puede venir como "true"/"false" en un querystring. */
const booleanoDeQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  studioName: z.string().trim().min(2, 'El nombre del estudio es obligatorio').max(120),
  name: z.string().trim().min(2, 'El nombre del usuario es obligatorio').max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contrasena es obligatoria'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* -------------------------------------------------------------------------- */
/* Empresas                                                                    */
/* -------------------------------------------------------------------------- */

export const createCompanySchema = z.object({
  razonSocial: z.string().trim().min(2, 'La razon social es obligatoria').max(200),
  cuit: cuitSchema,
  nombreFantasia: textoOpcional(200),
  condicionIva: condicionIvaEmisorSchema.default('RI'),
  domicilio: textoOpcional(200),
  localidad: textoOpcional(120),
  provincia: textoOpcional(120),
  ingresosBrutos: textoOpcional(60),
  inicioActividades: fechaIso.optional().nullable(),
  logoDataUrl: z
    .string()
    .max(2_000_000, 'El logo es demasiado grande')
    .optional()
    .nullable(),
  environment: environmentSchema.default('HOMO'),
  defaultPtoVta: z
    .number()
    .int()
    .min(1, 'El punto de venta debe ser mayor a cero')
    .max(99999)
    .default(1),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const credentialsSchema = z.object({
  certPem: z
    .string()
    .trim()
    .min(1, 'El certificado es obligatorio')
    .refine((v) => v.includes('BEGIN CERTIFICATE'), {
      message: 'El certificado debe estar en formato PEM (-----BEGIN CERTIFICATE-----)',
    }),
  keyPem: z
    .string()
    .trim()
    .min(1, 'La clave privada es obligatoria')
    .refine((v) => /BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY/.test(v), {
      message: 'La clave privada debe estar en formato PEM (-----BEGIN PRIVATE KEY-----)',
    }),
});
export type CredentialsInput = z.infer<typeof credentialsSchema>;

export const nextNumberQuerySchema = z.object({
  ptoVta: z.coerce.number().int().min(1).max(99999),
  cbteTipo: z.coerce.number().int().pipe(cbteTipoSchema),
});
export type NextNumberQuery = z.infer<typeof nextNumberQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Clientes                                                                    */
/* -------------------------------------------------------------------------- */

export const createCustomerSchema = z
  .object({
    companyId: idSchema.optional().nullable(),
    razonSocial: z.string().trim().min(2, 'La razon social es obligatoria').max(200),
    docTipo: docTipoSchema.default(80),
    docNro: z.string().trim().max(20).default('0'),
    condicionIvaReceptorId: condicionIvaReceptorSchema.default(5),
    email: z.string().trim().email('El email no tiene un formato valido').optional().nullable().or(z.literal('')),
    telefono: textoOpcional(40),
    domicilio: textoOpcional(200),
    localidad: textoOpcional(120),
    provincia: textoOpcional(120),
    notas: textoOpcional(2000),
  })
  .superRefine((data, ctx) => {
    validarDocumentoReceptor(data.docTipo, data.docNro, ctx);
  });
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    razonSocial: z.string().trim().min(2).max(200).optional(),
    docTipo: docTipoSchema.optional(),
    docNro: z.string().trim().max(20).optional(),
    condicionIvaReceptorId: condicionIvaReceptorSchema.optional(),
    email: z.string().trim().email('El email no tiene un formato valido').optional().nullable().or(z.literal('')),
    telefono: textoOpcional(40),
    domicilio: textoOpcional(200),
    localidad: textoOpcional(120),
    provincia: textoOpcional(120),
    notas: textoOpcional(2000),
    companyId: idSchema.optional().nullable(),
    active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.docTipo !== undefined && data.docNro !== undefined) {
      validarDocumentoReceptor(data.docTipo, data.docNro, ctx);
    }
  });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  companyId: idSchema.optional(),
  includeInactive: booleanoDeQuery.optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Productos                                                                   */
/* -------------------------------------------------------------------------- */

export const createProductSchema = z.object({
  companyId: idSchema,
  codigo: textoOpcional(40),
  descripcion: z.string().trim().min(1, 'La descripcion es obligatoria').max(200),
  unidad: z.string().trim().min(1).max(30).default('unidad'),
  precioUnitario: z
    .number()
    .min(0, 'El precio unitario no puede ser negativo')
    .finite('El precio unitario no es un numero valido'),
  ivaId: ivaIdSchema.default(5),
  precioConIva: z.boolean().default(false),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ companyId: true })
  .partial()
  .extend({ active: z.boolean().optional() });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  companyId: idSchema.optional(),
  search: z.string().trim().max(120).optional(),
  includeInactive: booleanoDeQuery.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Comprobantes                                                                */
/* -------------------------------------------------------------------------- */

export const invoiceItemSchema = z.object({
  productId: idSchema.optional().nullable(),
  descripcion: z.string().trim().min(1, 'La descripcion del item es obligatoria').max(200),
  cantidad: z
    .number()
    .positive('La cantidad debe ser mayor a cero')
    .finite('La cantidad no es un numero valido'),
  unidad: z.string().trim().min(1).max(30).default('unidad'),
  precioUnitario: z
    .number()
    .min(0, 'El precio unitario no puede ser negativo')
    .finite('El precio unitario no es un numero valido'),
  bonificacion: z
    .number()
    .min(0, 'La bonificacion no puede ser negativa')
    .max(100, 'La bonificacion no puede superar el 100%')
    .default(0),
  ivaId: ivaIdSchema.default(5),
  precioConIva: z.boolean().default(false),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export const tributoSchema = z.object({
  tributoId: z
    .number()
    .int()
    .refine((v) => idsTributo.includes(v), { message: 'Tipo de tributo desconocido' }),
  descripcion: z.string().trim().min(1, 'La descripcion del tributo es obligatoria').max(120),
  baseImp: z.number().min(0, 'La base imponible no puede ser negativa'),
  alicuota: z
    .number()
    .min(0, 'La alicuota no puede ser negativa')
    .max(100, 'La alicuota no puede superar el 100%'),
});
export type TributoBodyInput = z.infer<typeof tributoSchema>;

export const invoiceInputSchema = z
  .object({
    companyId: idSchema,
    ptoVta: z
      .number()
      .int()
      .min(1, 'El punto de venta debe ser mayor a cero')
      .max(99999)
      .optional(),
    cbteTipo: cbteTipoSchema.optional(),
    concepto: conceptoSchema.default(1),
    customerId: idSchema.optional().nullable(),
    docTipo: docTipoSchema.optional(),
    docNro: z.string().trim().max(20).optional(),
    receptorRazonSocial: textoOpcional(200),
    receptorDomicilio: textoOpcional(200),
    condicionIvaReceptorId: condicionIvaReceptorSchema.optional(),
    fechaCbte: fechaIso.optional(),
    fchServDesde: fechaIso.optional().nullable(),
    fchServHasta: fechaIso.optional().nullable(),
    fchVtoPago: fechaIso.optional().nullable(),
    monId: z.string().trim().min(3).max(3).default('PES'),
    monCotiz: z.number().positive('La cotizacion debe ser mayor a cero').default(1),
    items: z
      .array(invoiceItemSchema)
      .min(1, 'El comprobante necesita al menos un item'),
    tributos: z.array(tributoSchema).default([]),
    observaciones: textoOpcional(2000),
  })
  .superRefine((data, ctx) => {
    // Periodo de servicio: obligatorio cuando el concepto incluye servicios.
    if (requierePeriodoServicio(data.concepto)) {
      if (!data.fchServDesde) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fchServDesde'],
          message: 'Para comprobantes de servicios hay que informar el inicio del periodo facturado',
        });
      }
      if (!data.fchServHasta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fchServHasta'],
          message: 'Para comprobantes de servicios hay que informar el fin del periodo facturado',
        });
      }
      if (!data.fchVtoPago) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fchVtoPago'],
          message: 'Para comprobantes de servicios hay que informar la fecha de vencimiento de pago',
        });
      }
    }

    if (data.fchServDesde && data.fchServHasta && data.fchServDesde > data.fchServHasta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fchServHasta'],
        message: 'El fin del periodo facturado no puede ser anterior al inicio',
      });
    }

    if (data.fchServDesde && data.fchVtoPago && data.fchVtoPago < data.fchServDesde) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fchVtoPago'],
        message: 'El vencimiento de pago no puede ser anterior al inicio del periodo facturado',
      });
    }

    // Si no viene un cliente de la agenda, hay que mandar los datos sueltos.
    if (!data.customerId) {
      if (data.docTipo === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['docTipo'],
          message: 'Indica un cliente o el tipo de documento del receptor',
        });
      }
      if (data.docNro === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['docNro'],
          message: 'Indica un cliente o el numero de documento del receptor',
        });
      }
      if (data.condicionIvaReceptorId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['condicionIvaReceptorId'],
          message: 'Indica un cliente o la condicion frente al IVA del receptor',
        });
      }
    }

    if (data.docTipo !== undefined && data.docNro !== undefined) {
      validarDocumentoReceptor(data.docTipo, data.docNro, ctx);
    }

    if (data.monId !== 'PES' && data.monCotiz === 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monCotiz'],
        message: 'Para monedas distintas del peso hay que informar la cotizacion',
      });
    }
  });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const listInvoicesQuerySchema = z.object({
  companyId: idSchema.optional(),
  estado: z.enum(['BORRADOR', 'EMITIDA', 'RECHAZADA', 'ANULADA']).optional(),
  cbteTipo: z.coerce.number().int().optional(),
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const creditNoteSchema = z.object({
  motivo: textoOpcional(500),
  fechaCbte: fechaIso.optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
  tributos: z.array(tributoSchema).optional(),
});
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

/* -------------------------------------------------------------------------- */
/* Dashboard / padron / estado                                                 */
/* -------------------------------------------------------------------------- */

export const dashboardQuerySchema = z.object({
  companyId: idSchema.optional(),
  periodo: z.enum(['hoy', 'semana', 'mes', 'trimestre', 'anio']).default('mes'),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const padronParamsSchema = z.object({ cuit: cuitSchema });
export const padronQuerySchema = z.object({ companyId: idSchema.optional() });

export const arcaStatusQuerySchema = z.object({
  environment: environmentSchema.default('HOMO'),
});

export const idParamsSchema = z.object({ id: idSchema });

/* -------------------------------------------------------------------------- */
/* Validaciones de negocio                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Importe a partir del cual ARCA exige identificar al consumidor final.
 * Es un parametro que la AFIP/ARCA actualiza por resolucion general; se deja
 * como constante para poder moverlo en un solo lugar.
 */
export const UMBRAL_CONSUMIDOR_FINAL = Number(
  process.env['ARCA_UMBRAL_CONSUMIDOR_FINAL'] ?? 344_000,
);

function validarDocumentoReceptor(
  docTipo: number,
  docNro: string,
  ctx: z.RefinementCtx,
): void {
  const limpio = docNro.replace(/\D/g, '');

  if (docTipo === 99) {
    // Consumidor final sin identificar: ARCA exige DocNro = 0.
    if (limpio !== '' && Number(limpio) !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docNro'],
        message:
          'Con tipo de documento 99 (Consumidor Final) el numero de documento debe ser 0. Si necesitas identificar al cliente, usa CUIT o DNI.',
      });
    }
    return;
  }

  if (docTipo === 80 || docTipo === 86) {
    if (limpio.length !== 11 || !validarCuit(limpio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docNro'],
        message: `El ${docTipo === 80 ? 'CUIT' : 'CUIL'} "${docNro}" no es valido: revisa el digito verificador`,
      });
    }
    return;
  }

  if (docTipo === 96) {
    if (limpio.length < 6 || limpio.length > 9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['docNro'],
        message: 'El DNI debe tener entre 6 y 9 digitos',
      });
    }
    return;
  }

  if (limpio.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['docNro'],
      message: 'El numero de documento del receptor es obligatorio',
    });
  }
}

/** Datos necesarios para correr las validaciones de negocio del comprobante. */
export interface ContextoComprobante {
  condicionIvaEmisor: string;
  cbteTipo: number;
  concepto: number;
  docTipo: number;
  docNro: string;
  condicionIvaReceptorId: number;
  impTotal: number;
  fchServDesde?: Date | null;
  fchServHasta?: Date | null;
  fchVtoPago?: Date | null;
  /** Si es una nota de credito/debito, el comprobante asociado. */
  tieneAsociado?: boolean;
}

/**
 * Validaciones que no dependen del shape sino del negocio. Se corren tanto en
 * el preview (para avisar antes de emitir) como en la emision real (donde un
 * problema aca corta el flujo con VALIDATION_ERROR).
 *
 * Devuelve la lista de problemas encontrados, en espanol. Vacia = todo bien.
 */
export function validarNegocioComprobante(ctx: ContextoComprobante): string[] {
  const problemas: string[] = [];
  const letra = letraDeComprobante(ctx.cbteTipo);

  // 1. Coherencia entre el tipo de comprobante y la condicion IVA del emisor.
  if (ctx.condicionIvaEmisor === 'MONOTRIBUTO' || ctx.condicionIvaEmisor === 'EXENTO') {
    if (letra !== 'C') {
      problemas.push(
        `Un emisor ${ctx.condicionIvaEmisor === 'MONOTRIBUTO' ? 'monotributista' : 'exento'} solo puede emitir comprobantes clase C, no clase ${letra}`,
      );
    }
  } else if (ctx.condicionIvaEmisor === 'RI') {
    if (letra === 'C') {
      problemas.push(
        'Un responsable inscripto no puede emitir comprobantes clase C: corresponde clase A, B o M',
      );
    }
  }

  // 2. Clase A/M: solo contra responsables inscriptos o monotributistas, y con CUIT.
  if (letra === 'A' || letra === 'M') {
    if (ctx.docTipo !== 80) {
      problemas.push(
        `Los comprobantes clase ${letra} exigen identificar al receptor con CUIT (tipo de documento 80)`,
      );
    }
    if (ctx.condicionIvaReceptorId !== 1 && ctx.condicionIvaReceptorId !== 6) {
      problemas.push(
        `Los comprobantes clase ${letra} solo se emiten a responsables inscriptos o monotributistas. Para este receptor corresponde clase B.`,
      );
    }
  }

  // 3. Consumidor final sin identificar: solo por debajo del umbral.
  if (ctx.docTipo === 99) {
    if (letra === 'A' || letra === 'M') {
      problemas.push(
        'No se puede emitir un comprobante clase A a consumidor final sin identificar',
      );
    }
    if (Number(ctx.docNro.replace(/\D/g, '') || '0') !== 0) {
      problemas.push(
        'Con tipo de documento 99 (Consumidor Final) el numero de documento debe ser 0',
      );
    }
    if (ctx.impTotal >= UMBRAL_CONSUMIDOR_FINAL) {
      problemas.push(
        `Por un importe de $${ctx.impTotal.toFixed(2)} hay que identificar al comprador: a partir de $${UMBRAL_CONSUMIDOR_FINAL.toLocaleString('es-AR')} no se admite consumidor final sin identificar`,
      );
    }
  }

  // 4. Periodo de servicio.
  if (requierePeriodoServicio(ctx.concepto)) {
    if (!ctx.fchServDesde || !ctx.fchServHasta) {
      problemas.push(
        'El concepto incluye servicios: hay que informar el periodo facturado (desde y hasta)',
      );
    }
    if (!ctx.fchVtoPago) {
      problemas.push(
        'El concepto incluye servicios: hay que informar la fecha de vencimiento de pago',
      );
    }
    if (ctx.fchServDesde && ctx.fchServHasta && ctx.fchServDesde > ctx.fchServHasta) {
      problemas.push('El fin del periodo facturado no puede ser anterior al inicio');
    }
  }

  // 5. Notas de credito / debito necesitan comprobante asociado.
  if ((esNotaDeCredito(ctx.cbteTipo) || esNotaDeDebito(ctx.cbteTipo)) && ctx.tieneAsociado === false) {
    problemas.push(
      'Las notas de credito y de debito tienen que referenciar el comprobante original',
    );
  }

  // 6. Importe.
  if (ctx.impTotal <= 0) {
    problemas.push('El importe total del comprobante debe ser mayor a cero');
  }

  return problemas;
}

/* -------------------------------------------------------------------------- */
/* Helper de parseo                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Parsea con Zod dejando que el ZodError burbujee hasta el manejador global,
 * que lo traduce a VALIDATION_ERROR 400 con el detalle por campo.
 */
export function parsear<T extends z.ZodTypeAny>(schema: T, valor: unknown): z.infer<T> {
  return schema.parse(valor) as z.infer<T>;
}
