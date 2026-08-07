/**
 * Tests del calculo de importes.
 *
 * Estos casos son los que ARCA valida antes de otorgar el CAE: si alguno
 * falla, el comprobante se rechaza en produccion.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLinea, calcularTotales, validarTotales, round2 } from './totals.js';
import {
  tipoComprobanteSugerido,
  notaDeCreditoPara,
  letraDeComprobante,
  discriminaIva,
  requierePeriodoServicio,
} from './catalogs.js';

describe('calcularLinea', () => {
  test('Factura A: liquida 21% sobre el neto', () => {
    const l = calcularLinea(
      { descripcion: 'Servicio', cantidad: 1, precioUnitario: 100000, ivaId: 5 },
      1,
    );
    assert.equal(l.subtotalNeto, 100000);
    assert.equal(l.importeIva, 21000);
    assert.equal(l.subtotalConIva, 121000);
  });

  test('precio con IVA incluido: desagrega correctamente', () => {
    const l = calcularLinea(
      {
        descripcion: 'Producto',
        cantidad: 1,
        precioUnitario: 121000,
        ivaId: 5,
        precioConIva: true,
      },
      1,
    );
    assert.equal(l.subtotalNeto, 100000);
    assert.equal(l.importeIva, 21000);
    assert.equal(l.subtotalConIva, 121000);
  });

  test('el neto mas el IVA siempre da el bruto, sin perder centavos', () => {
    // 33,33 con IVA incluido no divide exacto: el redondeo no puede desbalancear.
    const l = calcularLinea(
      { descripcion: 'x', cantidad: 3, precioUnitario: 33.33, ivaId: 5, precioConIva: true },
      1,
    );
    assert.equal(l.subtotalConIva, 99.99);
    // Sumar los floats ya redondeados reintroduce el error de coma flotante
    // (82.64 + 17.35 = 99.99000000000001). Por eso `totals.ts` acumula en
    // centavos enteros: el total es exacto aunque las partes no se puedan
    // sumar ingenuamente.
    assert.notEqual(l.subtotalNeto + l.importeIva, l.subtotalConIva);
    assert.equal(round2(l.subtotalNeto + l.importeIva), l.subtotalConIva);
  });

  test('aplica la bonificacion antes de calcular el IVA', () => {
    const l = calcularLinea(
      { descripcion: 'x', cantidad: 1, precioUnitario: 1000, ivaId: 5, bonificacion: 10 },
      1,
    );
    assert.equal(l.subtotalNeto, 900);
    assert.equal(l.importeIva, 189);
  });

  test('Factura C: no liquida IVA, el precio es el total', () => {
    const l = calcularLinea(
      { descripcion: 'Honorarios', cantidad: 1, precioUnitario: 100000, ivaId: 5 },
      11,
    );
    assert.equal(l.subtotalNeto, 100000);
    assert.equal(l.importeIva, 0);
    assert.equal(l.subtotalConIva, 100000);
  });

  test('cantidad fraccionada (horas, kilos)', () => {
    const l = calcularLinea(
      { descripcion: 'Horas', cantidad: 2.5, precioUnitario: 12000, ivaId: 5 },
      1,
    );
    assert.equal(l.subtotalNeto, 30000);
    assert.equal(l.importeIva, 6300);
  });

  test('rechaza bonificaciones fuera de rango', () => {
    assert.throws(
      () =>
        calcularLinea(
          { descripcion: 'x', cantidad: 1, precioUnitario: 100, ivaId: 5, bonificacion: 150 },
          1,
        ),
      /bonificacion/i,
    );
  });
});

describe('calcularTotales', () => {
  test('agrupa varias alicuotas distintas en el array Iva', () => {
    const t = calcularTotales(
      [
        { descripcion: 'A', cantidad: 1, precioUnitario: 1000, ivaId: 5 }, // 21%
        { descripcion: 'B', cantidad: 1, precioUnitario: 2000, ivaId: 4 }, // 10.5%
        { descripcion: 'C', cantidad: 1, precioUnitario: 500, ivaId: 5 }, // 21%
      ],
      1,
    );

    assert.equal(t.iva.length, 2, 'debe haber una entrada por alicuota, no por item');

    const iva21 = t.iva.find((i) => i.Id === 5)!;
    assert.equal(iva21.BaseImp, 1500);
    assert.equal(iva21.Importe, 315);

    const iva105 = t.iva.find((i) => i.Id === 4)!;
    assert.equal(iva105.BaseImp, 2000);
    assert.equal(iva105.Importe, 210);

    assert.equal(t.impNeto, 3500);
    assert.equal(t.impIVA, 525);
    assert.equal(t.impTotal, 4025);
    assert.deepEqual(validarTotales(t), []);
  });

  test('las bases imponibles suman exactamente ImpNeto', () => {
    // Importes con decimales feos: es donde aparecen las diferencias de un centavo.
    const t = calcularTotales(
      [
        { descripcion: 'A', cantidad: 3, precioUnitario: 33.33, ivaId: 5 },
        { descripcion: 'B', cantidad: 7, precioUnitario: 11.11, ivaId: 4 },
        { descripcion: 'C', cantidad: 1, precioUnitario: 0.05, ivaId: 3 },
      ],
      1,
    );
    assert.deepEqual(validarTotales(t), [], 'ARCA rechazaria si no cierran');
  });

  test('suma otros tributos al total', () => {
    const t = calcularTotales(
      [{ descripcion: 'A', cantidad: 1, precioUnitario: 100000, ivaId: 5 }],
      1,
      [{ tributoId: 2, descripcion: 'IIBB CABA', baseImp: 100000, alicuota: 3 }],
    );
    assert.equal(t.impTrib, 3000);
    assert.equal(t.impTotal, 124000); // 100000 + 21000 + 3000
    assert.deepEqual(validarTotales(t), []);
  });

  test('Factura C no manda array de alicuotas y deja ImpIVA en cero', () => {
    const t = calcularTotales(
      [{ descripcion: 'Honorarios', cantidad: 1, precioUnitario: 150000, ivaId: 5 }],
      11,
    );
    assert.equal(t.iva.length, 0);
    assert.equal(t.impIVA, 0);
    assert.equal(t.impNeto, 150000);
    assert.equal(t.impTotal, 150000);
    assert.deepEqual(validarTotales(t), []);
  });

  test('Factura B informa el IVA a ARCA aunque no se discrimine en el impreso', () => {
    const t = calcularTotales(
      [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, ivaId: 5 }],
      6,
    );
    assert.equal(t.impIVA, 210);
    assert.equal(t.iva.length, 1);
  });

  test('exige al menos un item', () => {
    assert.throws(() => calcularTotales([], 1), /al menos un item/i);
  });
});

describe('validarTotales', () => {
  test('detecta un total que no cierra', () => {
    const t = calcularTotales(
      [{ descripcion: 'x', cantidad: 1, precioUnitario: 1000, ivaId: 5 }],
      1,
    );
    t.impTotal = 9999; // corrupcion deliberada
    const problemas = validarTotales(t);
    assert.ok(problemas.length > 0);
    assert.match(problemas[0]!, /ImpTotal/);
  });

  test('rechaza comprobantes en cero', () => {
    const t = calcularTotales(
      [{ descripcion: 'x', cantidad: 1, precioUnitario: 0, ivaId: 3 }],
      1,
    );
    assert.ok(validarTotales(t).some((p) => /mayor a cero/i.test(p)));
  });
});

describe('reglas de comprobantes', () => {
  test('monotributista siempre emite C', () => {
    assert.equal(tipoComprobanteSugerido('MONOTRIBUTO', 1), 11);
    assert.equal(tipoComprobanteSugerido('MONOTRIBUTO', 5), 11);
    assert.equal(tipoComprobanteSugerido('EXENTO', 1), 11);
  });

  test('responsable inscripto: A contra RI o monotributo, B contra el resto', () => {
    assert.equal(tipoComprobanteSugerido('RI', 1), 1, 'RI -> RI da Factura A');
    assert.equal(tipoComprobanteSugerido('RI', 6), 1, 'RI -> Monotributo da Factura A');
    assert.equal(tipoComprobanteSugerido('RI', 5), 6, 'RI -> Consumidor final da Factura B');
    assert.equal(tipoComprobanteSugerido('RI', 4), 6, 'RI -> Exento da Factura B');
  });

  test('cada comprobante tiene su nota de credito', () => {
    assert.equal(notaDeCreditoPara(1), 3);
    assert.equal(notaDeCreditoPara(6), 8);
    assert.equal(notaDeCreditoPara(11), 13);
    assert.equal(notaDeCreditoPara(201), 203);
  });

  test('letra y discriminacion de IVA por tipo', () => {
    assert.equal(letraDeComprobante(1), 'A');
    assert.equal(letraDeComprobante(6), 'B');
    assert.equal(letraDeComprobante(11), 'C');
    assert.equal(discriminaIva(1), true);
    assert.equal(discriminaIva(6), false, 'la B no discrimina al receptor');
    assert.equal(discriminaIva(11), false);
  });

  test('el periodo de servicio se exige solo en conceptos 2 y 3', () => {
    assert.equal(requierePeriodoServicio(1), false);
    assert.equal(requierePeriodoServicio(2), true);
    assert.equal(requierePeriodoServicio(3), true);
  });
});
