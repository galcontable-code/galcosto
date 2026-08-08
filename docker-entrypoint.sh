#!/bin/sh
# Arranque en produccion: sincroniza el esquema con la base y levanta la app.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "Falta DATABASE_URL. Configurala en las variables de entorno del servicio." >&2
  exit 1
fi

echo "Ajustando el proveedor de base de datos..."
node scripts/proveedor-db.mjs "$DATABASE_URL"

echo "Sincronizando el esquema..."
npx prisma db push --schema server/prisma/schema.prisma --skip-generate --accept-data-loss

echo "Iniciando Galcosto..."
exec node server/dist/index.js
