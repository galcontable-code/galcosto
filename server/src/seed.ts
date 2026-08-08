/**
 * Datos de ejemplo para poder usar la app apenas se instala.
 *
 * Es idempotente: se puede correr muchas veces sin duplicar nada. Crea el
 * estudio, el usuario demo, tres empresas emisoras con distinta condicion
 * frente al IVA, clientes, productos y comprobantes ya emitidos de los
 * ultimos dos meses para que el dashboard y los listados tengan contenido.
 *
 * Los comprobantes que genera son de DEMO: el CAE es simulado y no tienen
 * validez fiscal.
 */

import { prisma } from './lib/prisma.js';
import { hashPassword } from './lib/auth.js';
import { calcularTotales, type LineInput } from './domain/totals.js';
import { buildQrUrl } from './arca/qr.js';

const EMAIL_DEMO = 'demo@galcosto.app';
const PASSWORD_DEMO = 'Demo1234!';

/**
 * Completa el digito verificador de un CUIT a partir de sus 10 primeros
 * digitos, para no hardcodear numeros que despues no validan.
 */
function conDigitoVerificador(base: string): string {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = base.replace(/\D/g, '').padStart(10, '0').slice(0, 10);
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return `${digitos}${dv}`;
}

function diasAtras(dias: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d;
}

function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

/** CAE simulado: 14 digitos, con la misma forma que devuelve ARCA. */
function caeDemo(semilla: number): string {
  const base = `7${String(60000000000000 + semilla * 7919).slice(0, 13)}`;
  return base.slice(0, 14);
}

async function main(): Promise<void> {
  // El seed crea un usuario con contrasena conocida. En una instalacion
  // publicada eso es una puerta abierta, asi que hay que pedirlo a proposito.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO !== 'true') {
    console.log(
      'Seed omitido: NODE_ENV=production.\n' +
        'Los datos de ejemplo incluyen un usuario con contrasena publica.\n' +
        'Si igual los queres, corre con SEED_DEMO=true.',
    );
    return;
  }

  console.log('Cargando datos de ejemplo...\n');

  // ---------------------------------------------------------------- estudio
  const studio = await prisma.studio.upsert({
    where: { id: 'seed-studio' },
    update: {},
    create: {
      id: 'seed-studio',
      name: 'Estudio Contable Galcosto',
      cuit: conDigitoVerificador('3071234567'),
      email: EMAIL_DEMO,
    },
  });

  const passwordHash = await hashPassword(PASSWORD_DEMO);
  const user = await prisma.user.upsert({
    where: { email: EMAIL_DEMO },
    update: { passwordHash, studioId: studio.id },
    create: {
      studioId: studio.id,
      email: EMAIL_DEMO,
      passwordHash,
      name: 'Contador Demo',
      role: 'ADMIN',
    },
  });

  // --------------------------------------------------------------- empresas
  const empresasSeed = [
    {
      id: 'seed-empresa-ri',
      razonSocial: 'Consultora del Plata S.R.L.',
      nombreFantasia: 'Del Plata',
      cuit: conDigitoVerificador('3065432101'),
      condicionIva: 'RI',
      domicilio: 'Av. Corrientes 1234, Piso 5',
      localidad: 'Ciudad Autonoma de Buenos Aires',
      provincia: 'CABA',
      ingresosBrutos: '901-234567-8',
      inicioActividades: new Date('2015-03-01T12:00:00Z'),
    },
    {
      id: 'seed-empresa-mono',
      razonSocial: 'Rodriguez Maria Laura',
      nombreFantasia: 'Estudio Rodriguez',
      cuit: conDigitoVerificador('2728456712'),
      condicionIva: 'MONOTRIBUTO',
      domicilio: 'San Martin 450',
      localidad: 'Rosario',
      provincia: 'Santa Fe',
      ingresosBrutos: 'Exento',
      inicioActividades: new Date('2019-08-15T12:00:00Z'),
    },
    {
      id: 'seed-empresa-exenta',
      razonSocial: 'Fundacion Aprender A.C.',
      nombreFantasia: 'Fundacion Aprender',
      cuit: conDigitoVerificador('3399887761'),
      condicionIva: 'EXENTO',
      domicilio: 'Belgrano 890',
      localidad: 'Cordoba',
      provincia: 'Cordoba',
      ingresosBrutos: 'Exento',
      inicioActividades: new Date('2012-01-10T12:00:00Z'),
    },
  ];

  const empresas = [];
  for (const e of empresasSeed) {
    empresas.push(
      await prisma.company.upsert({
        where: { id: e.id },
        update: {},
        create: {
          ...e,
          studioId: studio.id,
          environment: 'HOMO',
          defaultPtoVta: 1,
        },
      }),
    );
  }
  const [empresaRi, empresaMono, empresaExenta] = empresas;

  // --------------------------------------------------------------- clientes
  const clientesSeed = [
    { id: 'seed-cli-1', razonSocial: 'Distribuidora Norte S.A.', base: '3070123456', docTipo: 80, cond: 1 },
    { id: 'seed-cli-2', razonSocial: 'Tecno Servicios S.R.L.', base: '3065987654', docTipo: 80, cond: 1 },
    { id: 'seed-cli-3', razonSocial: 'Gomez Hermanos S.H.', base: '3071456789', docTipo: 80, cond: 1 },
    { id: 'seed-cli-4', razonSocial: 'Perez Juan Carlos', base: '2012345678', docTipo: 80, cond: 6 },
    { id: 'seed-cli-5', razonSocial: 'Lopez Ana Maria', base: '2723456789', docTipo: 80, cond: 6 },
    { id: 'seed-cli-6', razonSocial: 'Cooperativa El Progreso', base: '3364789012', docTipo: 80, cond: 4 },
    { id: 'seed-cli-7', razonSocial: 'Martinez Sofia', base: '2734567890', docTipo: 96, cond: 5 },
    { id: 'seed-cli-8', razonSocial: 'Consumidor Final', base: '0', docTipo: 99, cond: 5 },
  ];

  const clientes = [];
  for (const c of clientesSeed) {
    const docNro = c.docTipo === 99 ? '0' : c.docTipo === 96 ? '34567890' : conDigitoVerificador(c.base);
    clientes.push(
      await prisma.customer.upsert({
        where: { id: c.id },
        update: {},
        create: {
          id: c.id,
          studioId: studio.id,
          razonSocial: c.razonSocial,
          docTipo: c.docTipo,
          docNro,
          condicionIvaReceptorId: c.cond,
          email: c.docTipo === 99 ? null : `contacto@${c.id}.example`,
          domicilio: 'Av. Siempre Viva 742',
          localidad: 'Buenos Aires',
          provincia: 'Buenos Aires',
        },
      }),
    );
  }

  // -------------------------------------------------------------- productos
  const productosSeed = [
    { id: 'seed-prod-1', companyId: empresaRi.id, codigo: 'HON-01', descripcion: 'Honorarios profesionales', unidad: 'hora', precioUnitario: 25000, ivaId: 5 },
    { id: 'seed-prod-2', companyId: empresaRi.id, codigo: 'CON-01', descripcion: 'Consultoria de sistemas', unidad: 'hora', precioUnitario: 38000, ivaId: 5 },
    { id: 'seed-prod-3', companyId: empresaRi.id, codigo: 'SOP-01', descripcion: 'Soporte tecnico mensual', unidad: 'mes', precioUnitario: 180000, ivaId: 5 },
    { id: 'seed-prod-4', companyId: empresaRi.id, codigo: 'LIB-01', descripcion: 'Material bibliografico', unidad: 'unidad', precioUnitario: 45000, ivaId: 3 },
    { id: 'seed-prod-5', companyId: empresaRi.id, codigo: 'ALI-01', descripcion: 'Productos alimenticios', unidad: 'unidad', precioUnitario: 12500, ivaId: 4 },
    { id: 'seed-prod-6', companyId: empresaMono.id, codigo: 'ASE-01', descripcion: 'Asesoramiento contable mensual', unidad: 'mes', precioUnitario: 95000, ivaId: 5 },
    { id: 'seed-prod-7', companyId: empresaMono.id, codigo: 'LIQ-01', descripcion: 'Liquidacion de sueldos', unidad: 'legajo', precioUnitario: 8500, ivaId: 5 },
    { id: 'seed-prod-8', companyId: empresaMono.id, codigo: 'BAL-01', descripcion: 'Confeccion de balance', unidad: 'unidad', precioUnitario: 320000, ivaId: 5 },
    { id: 'seed-prod-9', companyId: empresaExenta.id, codigo: 'CUR-01', descripcion: 'Curso de capacitacion', unidad: 'cupo', precioUnitario: 65000, ivaId: 5 },
    { id: 'seed-prod-10', companyId: empresaExenta.id, codigo: 'TAL-01', descripcion: 'Taller institucional', unidad: 'jornada', precioUnitario: 140000, ivaId: 5 },
  ];

  for (const p of productosSeed) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, precioConIva: false },
    });
  }

  // ----------------------------------------------------------- comprobantes
  // Se generan solo si todavia no hay ninguno, para no ensuciar una base en
  // la que ya se estuvo trabajando.
  const yaHayComprobantes = await prisma.invoice.count({ where: { companyId: { in: empresas.map((e) => e.id) } } });

  if (yaHayComprobantes > 0) {
    console.log(`Ya existen ${yaHayComprobantes} comprobantes: no se generan de nuevo.\n`);
  } else {
    const plantillas: Array<{
      empresa: (typeof empresas)[number];
      clienteIdx: number;
      cbteTipo: number;
      concepto: 1 | 2 | 3;
      items: LineInput[];
      dias: number;
    }> = [
      { empresa: empresaRi, clienteIdx: 0, cbteTipo: 1, concepto: 2, dias: 58, items: [{ descripcion: 'Soporte tecnico mensual', cantidad: 1, precioUnitario: 180000, ivaId: 5 }] },
      { empresa: empresaRi, clienteIdx: 1, cbteTipo: 1, concepto: 1, dias: 52, items: [{ descripcion: 'Consultoria de sistemas', cantidad: 12, precioUnitario: 38000, ivaId: 5 }] },
      { empresa: empresaRi, clienteIdx: 6, cbteTipo: 6, concepto: 1, dias: 47, items: [{ descripcion: 'Material bibliografico', cantidad: 2, precioUnitario: 45000, ivaId: 3 }, { descripcion: 'Productos alimenticios', cantidad: 10, precioUnitario: 12500, ivaId: 4 }] },
      { empresa: empresaRi, clienteIdx: 2, cbteTipo: 1, concepto: 2, dias: 41, items: [{ descripcion: 'Honorarios profesionales', cantidad: 20, precioUnitario: 25000, ivaId: 5, bonificacion: 10 }] },
      { empresa: empresaRi, clienteIdx: 0, cbteTipo: 1, concepto: 2, dias: 35, items: [{ descripcion: 'Soporte tecnico mensual', cantidad: 1, precioUnitario: 180000, ivaId: 5 }] },
      { empresa: empresaRi, clienteIdx: 3, cbteTipo: 1, concepto: 1, dias: 28, items: [{ descripcion: 'Consultoria de sistemas', cantidad: 8, precioUnitario: 38000, ivaId: 5 }] },
      { empresa: empresaRi, clienteIdx: 7, cbteTipo: 6, concepto: 1, dias: 21, items: [{ descripcion: 'Material bibliografico', cantidad: 1, precioUnitario: 45000, ivaId: 3 }] },
      { empresa: empresaRi, clienteIdx: 1, cbteTipo: 1, concepto: 2, dias: 14, items: [{ descripcion: 'Honorarios profesionales', cantidad: 15, precioUnitario: 25000, ivaId: 5 }] },
      { empresa: empresaRi, clienteIdx: 0, cbteTipo: 1, concepto: 2, dias: 6, items: [{ descripcion: 'Soporte tecnico mensual', cantidad: 1, precioUnitario: 180000, ivaId: 5 }] },
      { empresa: empresaRi, clienteIdx: 5, cbteTipo: 6, concepto: 2, dias: 2, items: [{ descripcion: 'Consultoria de sistemas', cantidad: 4, precioUnitario: 38000, ivaId: 5 }] },

      { empresa: empresaMono, clienteIdx: 0, cbteTipo: 11, concepto: 2, dias: 45, items: [{ descripcion: 'Asesoramiento contable mensual', cantidad: 1, precioUnitario: 95000, ivaId: 5 }] },
      { empresa: empresaMono, clienteIdx: 2, cbteTipo: 11, concepto: 2, dias: 32, items: [{ descripcion: 'Liquidacion de sueldos', cantidad: 12, precioUnitario: 8500, ivaId: 5 }] },
      { empresa: empresaMono, clienteIdx: 4, cbteTipo: 11, concepto: 1, dias: 18, items: [{ descripcion: 'Confeccion de balance', cantidad: 1, precioUnitario: 320000, ivaId: 5 }] },
      { empresa: empresaMono, clienteIdx: 0, cbteTipo: 11, concepto: 2, dias: 9, items: [{ descripcion: 'Asesoramiento contable mensual', cantidad: 1, precioUnitario: 95000, ivaId: 5 }] },

      { empresa: empresaExenta, clienteIdx: 5, cbteTipo: 11, concepto: 2, dias: 25, items: [{ descripcion: 'Curso de capacitacion', cantidad: 8, precioUnitario: 65000, ivaId: 5 }] },
      { empresa: empresaExenta, clienteIdx: 2, cbteTipo: 11, concepto: 2, dias: 11, items: [{ descripcion: 'Taller institucional', cantidad: 2, precioUnitario: 140000, ivaId: 5 }] },
    ];

    // Numeracion correlativa por empresa + punto de venta + tipo.
    const contadores = new Map<string, number>();

    for (const [i, p] of plantillas.entries()) {
      const cliente = clientes[p.clienteIdx];
      const totales = calcularTotales(p.items, p.cbteTipo);
      const fecha = diasAtras(p.dias);

      const clave = `${p.empresa.id}-1-${p.cbteTipo}`;
      const nro = (contadores.get(clave) ?? 0) + 1;
      contadores.set(clave, nro);

      const cae = caeDemo(i + 1);
      const caeVto = sumarDias(fecha, 10);

      const qrUrl = buildQrUrl({
        fecha,
        cuit: p.empresa.cuit,
        ptoVta: 1,
        tipoCmp: p.cbteTipo,
        nroCmp: nro,
        importe: totales.impTotal,
        moneda: 'PES',
        ctz: 1,
        tipoDocRec: cliente.docTipo,
        nroDocRec: Number(cliente.docNro) || 0,
        codAut: cae,
      });

      await prisma.invoice.create({
        data: {
          companyId: p.empresa.id,
          customerId: cliente.id,
          createdById: user.id,
          ptoVta: 1,
          cbteTipo: p.cbteTipo,
          cbteNro: nro,
          concepto: p.concepto,
          docTipo: cliente.docTipo,
          docNro: cliente.docNro,
          receptorRazonSocial: cliente.razonSocial,
          receptorDomicilio: cliente.domicilio,
          condicionIvaReceptorId: cliente.condicionIvaReceptorId,
          fechaCbte: fecha,
          fchServDesde: p.concepto === 1 ? null : fecha,
          fchServHasta: p.concepto === 1 ? null : sumarDias(fecha, 30),
          fchVtoPago: p.concepto === 1 ? null : sumarDias(fecha, 30),
          monId: 'PES',
          monCotiz: 1,
          impNeto: totales.impNeto,
          impIVA: totales.impIVA,
          impTotConc: totales.impTotConc,
          impOpEx: totales.impOpEx,
          impTrib: totales.impTrib,
          impTotal: totales.impTotal,
          estado: 'EMITIDA',
          resultado: 'A',
          cae,
          caeVto,
          qrPayload: qrUrl,
          environment: 'HOMO',
          emitidaAt: fecha,
          items: {
            create: totales.items.map((item, orden) => ({
              orden,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              unidad: 'unidad',
              precioUnitario: item.precioUnitario,
              bonificacion: item.bonificacion,
              ivaId: item.ivaId,
              subtotalNeto: item.subtotalNeto,
              importeIva: item.importeIva,
              subtotalConIva: item.subtotalConIva,
            })),
          },
        },
      });
    }

    console.log(`Comprobantes de ejemplo generados: ${plantillas.length}`);
  }

  const totalFacturado = await prisma.invoice.aggregate({
    where: { estado: 'EMITIDA' },
    _sum: { impTotal: true },
  });

  console.log(`
Datos cargados.

  Estudio ....... ${studio.name}
  Empresas ...... ${empresas.length} (${empresas.map((e) => e.condicionIva).join(', ')})
  Clientes ...... ${clientes.length}
  Productos ..... ${productosSeed.length}
  Facturado ..... $ ${(totalFacturado._sum.impTotal ?? 0).toLocaleString('es-AR')}

Entra con:

  usuario ....... ${EMAIL_DEMO}
  contrasena .... ${PASSWORD_DEMO}

Los comprobantes son de demostracion: el CAE es simulado y no tienen
validez fiscal.
`);
}

main()
  .catch((e) => {
    console.error('Fallo la carga de datos de ejemplo:\n', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
