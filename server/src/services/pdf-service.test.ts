/**
 * Tests del armado del comprobante impreso.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { codigoComprobante } from './pdf-service.js';

describe('codigo impreso debajo de la letra', () => {
  test('los comprobantes comunes van con dos digitos', () => {
    // Es lo que ARCA imprime: "COD. 01", no "COD. 001".
    assert.equal(codigoComprobante(1), 'COD. 01');
    assert.equal(codigoComprobante(3), 'COD. 03');
    assert.equal(codigoComprobante(6), 'COD. 06');
    assert.equal(codigoComprobante(8), 'COD. 08');
    assert.equal(codigoComprobante(11), 'COD. 11');
    assert.equal(codigoComprobante(13), 'COD. 13');
    assert.equal(codigoComprobante(51), 'COD. 51');
  });

  test('los MiPyME conservan sus tres digitos', () => {
    assert.equal(codigoComprobante(201), 'COD. 201');
    assert.equal(codigoComprobante(206), 'COD. 206');
    assert.equal(codigoComprobante(213), 'COD. 213');
  });
});
