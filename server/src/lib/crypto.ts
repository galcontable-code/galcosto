/**
 * Cifrado en reposo de los secretos de ARCA (certificado X.509 y clave
 * privada de cada empresa) y utilidades para inspeccionarlos.
 *
 * Formato del texto cifrado:  v1:<ivHex>:<tagHex>:<cipherHex>
 *   - v1        prefijo de version, para poder rotar el algoritmo mas adelante
 *   - ivHex     12 bytes aleatorios (nonce GCM), distinto en cada cifrado
 *   - tagHex    16 bytes del tag de autenticacion GCM
 *   - cipherHex el texto cifrado
 *
 * La clave sale de `config.encryptionKey` (32 bytes en hex).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import forge from 'node-forge';
import { config } from '../config.js';

const VERSION = 'v1';
const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Valida y convierte la clave hexadecimal de 32 bytes.
 * Se exporta para poder testear el mensaje de error sin tocar el config.
 */
export function parseEncryptionKey(raw: string): Buffer {
  const limpio = (raw ?? '').trim();
  if (limpio.length !== 64 || !HEX_64.test(limpio)) {
    throw new Error(
      'APP_ENCRYPTION_KEY invalida: se esperan 64 caracteres hexadecimales (32 bytes) y se ' +
        `recibieron ${limpio.length}. Generá una con: openssl rand -hex 32`,
    );
  }
  return Buffer.from(limpio, 'hex');
}

function clave(): Buffer {
  return parseEncryptionKey(config.encryptionKey);
}

/** Cifra un secreto (PEM del certificado o de la clave privada). */
export function encryptSecret(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('No se puede cifrar un valor vacio');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, clave(), iv);
  const cifrado = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('hex'), tag.toString('hex'), cifrado.toString('hex')].join(':');
}

/** Descifra un secreto generado por `encryptSecret`. */
export function decryptSecret(enc: string): string {
  if (typeof enc !== 'string' || enc.length === 0) {
    throw new Error('No se puede descifrar un valor vacio');
  }
  const partes = enc.split(':');
  if (partes.length !== 4) {
    throw new Error(
      'Formato de secreto cifrado invalido: se esperaba v1:<iv>:<tag>:<cifrado>',
    );
  }
  const [version, ivHex, tagHex, cipherHex] = partes as [string, string, string, string];
  if (version !== VERSION) {
    throw new Error(`Version de cifrado no soportada: ${version}`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const cifrado = Buffer.from(cipherHex, 'hex');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Secreto cifrado corrupto: el IV o el tag de autenticacion no son validos');
  }

  try {
    const decipher = createDecipheriv(ALGORITMO, clave(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new Error(
      'No se pudo descifrar el secreto: la clave APP_ENCRYPTION_KEY no coincide con la que se ' +
        'uso para cifrarlo, o el dato esta corrupto. Si cambiaste la clave, volvé a subir el ' +
        'certificado de la empresa.',
      { cause: err },
    );
  }
}

/** Arma "CN=..., O=..., serialNumber=CUIT 20..." a partir de los atributos del DN. */
function formatearDn(attrs: forge.pki.CertificateField[]): string {
  return attrs
    .map((a) => {
      const nombre = a.shortName ?? a.name ?? a.type ?? '?';
      const valor = typeof a.value === 'string' ? a.value : String(a.value ?? '');
      return `${nombre}=${valor}`;
    })
    .join(', ');
}

function leerCertificado(certPem: string): forge.pki.Certificate {
  if (typeof certPem !== 'string' || !certPem.includes('BEGIN CERTIFICATE')) {
    throw new Error(
      'El certificado no parece un PEM valido: tiene que empezar con "-----BEGIN CERTIFICATE-----"',
    );
  }
  try {
    return forge.pki.certificateFromPem(certPem);
  } catch (err) {
    throw new Error(
      'No se pudo leer el certificado X.509. Verificá que sea el archivo .crt/.pem que te ' +
        'devolvio ARCA, sin modificar.',
      { cause: err },
    );
  }
}

function leerClavePrivada(keyPem: string): forge.pki.rsa.PrivateKey {
  if (typeof keyPem !== 'string' || !keyPem.includes('BEGIN')) {
    throw new Error(
      'La clave privada no parece un PEM valido: tiene que empezar con "-----BEGIN PRIVATE KEY-----" ' +
        'o "-----BEGIN RSA PRIVATE KEY-----"',
    );
  }
  if (/ENCRYPTED/i.test(keyPem)) {
    throw new Error(
      'La clave privada esta protegida con contrasena. Quitale la contrasena antes de subirla: ' +
        'openssl rsa -in clave.key -out clave-sin-pass.key',
    );
  }
  try {
    return forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  } catch (err) {
    throw new Error(
      'No se pudo leer la clave privada. Verificá que sea la misma que generaste junto al pedido ' +
        'de certificado (CSR).',
      { cause: err },
    );
  }
}

/**
 * Datos utiles del certificado para mostrar en la ficha de la empresa
 * (sujeto, emisor y fecha de vencimiento).
 */
export function inspectCertificate(certPem: string): {
  subject: string;
  expiresAt: Date;
  issuer: string;
} {
  const cert = leerCertificado(certPem);
  return {
    subject: formatearDn(cert.subject.attributes),
    issuer: formatearDn(cert.issuer.attributes),
    expiresAt: cert.validity.notAfter,
  };
}

/**
 * Verifica que la clave privada se corresponda con la clave publica del
 * certificado (mismo modulo y mismo exponente).
 *
 * Lanza `Error` con mensaje en espanol si alguno de los dos PEM es ilegible;
 * devuelve `false` solo cuando ambos son validos pero no forman par.
 */
export function validateKeyPair(certPem: string, keyPem: string): boolean {
  const cert = leerCertificado(certPem);
  const key = leerClavePrivada(keyPem);
  const publica = cert.publicKey as forge.pki.rsa.PublicKey | undefined;
  if (!publica?.n || !key?.n) return false;
  return publica.n.compareTo(key.n) === 0 && publica.e.compareTo(key.e) === 0;
}
