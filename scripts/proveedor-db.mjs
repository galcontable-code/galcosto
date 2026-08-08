#!/usr/bin/env node
/**
 * Ajusta el `provider` del datasource de Prisma segun la DATABASE_URL.
 *
 * En local se usa SQLite (un archivo, cero configuracion) y en un servidor
 * PostgreSQL (los discos de los servicios gestionados son efimeros: un
 * archivo SQLite se perderia en cada despliegue). Prisma no acepta una
 * variable de entorno en `provider`, asi que se reescribe esa unica linea en
 * vez de mantener dos esquemas que se desincronizan.
 *
 * Uso: node scripts/proveedor-db.mjs [url]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEsquema = resolve(raizRepo, 'server/prisma/schema.prisma');

const url = process.argv[2] ?? process.env.DATABASE_URL ?? '';

function proveedorPara(url) {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  if (url.startsWith('sqlserver://')) return 'sqlserver';
  return 'sqlite';
}

const proveedor = proveedorPara(url);
const esquema = readFileSync(rutaEsquema, 'utf8');
const actualizado = esquema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/s,
  `$1${proveedor}$2`,
);

if (actualizado === esquema) {
  console.log(`El proveedor ya era "${proveedor}": no hay nada que cambiar.`);
} else {
  writeFileSync(rutaEsquema, actualizado);
  console.log(`Proveedor de base de datos ajustado a "${proveedor}".`);
}
