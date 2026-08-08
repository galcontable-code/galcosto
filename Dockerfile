# Imagen de produccion de Galcosto: un solo proceso sirve la API y el frontend.

FROM node:22-slim AS build

# Prisma necesita openssl para su motor de consultas.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .

# En un servidor la base es PostgreSQL: el disco de la app es efimero y un
# archivo SQLite se perderia en cada despliegue.
ARG DATABASE_URL=postgresql://placeholder
RUN node scripts/proveedor-db.mjs "$DATABASE_URL" \
    && npx --workspace server prisma generate

RUN npm run build

# Se descartan las dependencias de desarrollo, pero se conserva la CLI de
# Prisma: al arrancar hay que sincronizar el esquema con la base real.
RUN npm prune --omit=dev && npm install --no-save prisma@6


FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/web/dist ./web/dist

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000
CMD ["./docker-entrypoint.sh"]
