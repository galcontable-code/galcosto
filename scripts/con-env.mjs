#!/usr/bin/env node
/**
 * Corre un comando con el .env de la raiz del repo ya cargado.
 *
 * Los scripts de los workspaces se ejecutan con el cwd en `server/`, asi que
 * la CLI de Prisma busca el .env ahi y no lo encuentra: el archivo vive en la
 * raiz, que es donde el usuario lo copia siguiendo el README. Este envoltorio
 * lo carga y delega, para que haya un solo .env en todo el proyecto.
 *
 * Uso: node ../scripts/con-env.mjs prisma db push
 */

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizRepo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archivoEnv = resolve(raizRepo, '.env');

/**
 * Parser minimo de .env: alcanza para `CLAVE=valor`, con comillas opcionales
 * y comentarios. No se usa dotenv para no obligar a instalar dependencias
 * antes de poder crear la base.
 */
function cargarEnv(ruta) {
  if (!existsSync(ruta)) return 0;

  let cargadas = 0;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const separador = limpia.indexOf('=');
    if (separador === -1) continue;

    const clave = limpia.slice(0, separador).trim();
    let valor = limpia.slice(separador + 1).trim();

    // Quitar comillas envolventes si las hay.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    // Lo que ya venga del entorno gana: permite sobreescribir por comando.
    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
      cargadas += 1;
    }
  }
  return cargadas;
}

cargarEnv(archivoEnv);

if (!process.env.DATABASE_URL) {
  console.error(
    `\nFalta DATABASE_URL.\n\n` +
      `No se encontro ${archivoEnv}.\n` +
      `Copia el archivo de ejemplo y volve a intentar:\n\n` +
      `  cp .env.example .env\n`,
  );
  process.exit(1);
}

const [comando, ...args] = process.argv.slice(2);
if (!comando) {
  console.error('Uso: node scripts/con-env.mjs <comando> [args...]');
  process.exit(1);
}

const hijo = spawn(comando, args, { stdio: 'inherit', shell: process.platform === 'win32' });
hijo.on('exit', (codigo, senal) => process.exit(senal ? 1 : (codigo ?? 0)));
hijo.on('error', (e) => {
  console.error(`No se pudo ejecutar "${comando}":`, e.message);
  process.exit(1);
});
