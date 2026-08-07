import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import forge from 'node-forge';

import {
  decryptSecret,
  encryptSecret,
  inspectCertificate,
  parseEncryptionKey,
  validateKeyPair,
} from './crypto.js';

/** Genera un certificado autofirmado para probar sin depender de archivos. */
function certificadoDePrueba(diasValidez = 365): {
  certPem: string;
  keyPem: string;
  otraKeyPem: string;
} {
  const par = forge.pki.rsa.generateKeyPair(1024);
  const otro = forge.pki.rsa.generateKeyPair(1024);

  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + diasValidez * 24 * 60 * 60 * 1000);
  const atributos = [
    { name: 'commonName', value: 'galcosto' },
    { name: 'organizationName', value: 'ESTUDIO DEMO SRL' },
    { name: 'countryName', value: 'AR' },
  ];
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(par.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(par.privateKey),
    otraKeyPem: forge.pki.privateKeyToPem(otro.privateKey),
  };
}

describe('cifrado de secretos (AES-256-GCM)', () => {
  it('hace round-trip de un PEM completo', () => {
    const pem =
      '-----BEGIN CERTIFICATE-----\nMIIB...datos...con\nsaltos y acentos: Cía Ñandú\n-----END CERTIFICATE-----\n';
    const cifrado = encryptSecret(pem);
    assert.equal(decryptSecret(cifrado), pem);
  });

  it('usa el formato v1:<iv>:<tag>:<cifrado> en hexadecimal', () => {
    const partes = encryptSecret('hola').split(':');
    assert.equal(partes.length, 4);
    assert.equal(partes[0], 'v1');
    assert.equal(partes[1]?.length, 24, 'el IV son 12 bytes en hex');
    assert.equal(partes[2]?.length, 32, 'el tag son 16 bytes en hex');
    for (const parte of partes.slice(1)) {
      assert.match(parte as string, /^[0-9a-f]+$/);
    }
  });

  it('genera un texto cifrado distinto cada vez (IV aleatorio)', () => {
    const a = encryptSecret('mismo secreto');
    const b = encryptSecret('mismo secreto');
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), decryptSecret(b));
  });

  it('rechaza un texto cifrado adulterado', () => {
    const cifrado = encryptSecret('secreto importante');
    const partes = cifrado.split(':');
    const alterado = `${partes[0]}:${partes[1]}:${partes[2]}:${'ff'}${(partes[3] as string).slice(2)}`;
    assert.throws(() => decryptSecret(alterado), /No se pudo descifrar/);
  });

  it('rechaza formatos invalidos con mensaje claro', () => {
    assert.throws(() => decryptSecret('cualquier cosa'), /Formato de secreto cifrado invalido/);
    assert.throws(() => decryptSecret('v2:aa:bb:cc'), /Version de cifrado no soportada/);
    assert.throws(() => encryptSecret(''), /vacio/);
  });

  it('exige una clave de 64 caracteres hexadecimales', () => {
    assert.throws(() => parseEncryptionKey('corta'), /64 caracteres hexadecimales/);
    assert.throws(() => parseEncryptionKey('z'.repeat(64)), /64 caracteres hexadecimales/);
    assert.equal(parseEncryptionKey('a'.repeat(64)).length, 32);
  });
});

describe('inspeccion de certificados', () => {
  let pems: { certPem: string; keyPem: string; otraKeyPem: string };

  before(() => {
    pems = certificadoDePrueba();
  });

  it('lee sujeto, emisor y vencimiento', () => {
    const info = inspectCertificate(pems.certPem);
    assert.match(info.subject, /CN=galcosto/);
    assert.match(info.subject, /O=ESTUDIO DEMO SRL/);
    assert.match(info.issuer, /CN=galcosto/);
    assert.ok(info.expiresAt instanceof Date);
    assert.ok(info.expiresAt.getTime() > Date.now());
  });

  it('avisa cuando el PEM no es un certificado', () => {
    assert.throws(() => inspectCertificate('no soy un pem'), /BEGIN CERTIFICATE/);
  });

  it('valida que la clave privada corresponda al certificado', () => {
    assert.equal(validateKeyPair(pems.certPem, pems.keyPem), true);
    assert.equal(validateKeyPair(pems.certPem, pems.otraKeyPem), false);
  });

  it('rechaza claves privadas con contrasena', () => {
    const conPass =
      '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-256-CBC,00\n\nZZZ\n-----END RSA PRIVATE KEY-----';
    assert.throws(() => validateKeyPair(pems.certPem, conPass), /contrasena/);
  });
});
