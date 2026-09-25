# Imagen de producción/staging de la API. La misma imagen corre en los dos
# ambientes: lo único que cambia es el .env que le pasa docker compose en el
# servidor (ver deploy/). Desarrollo local sigue usando Dockerfile.dev.
#
# No corre migraciones ni seeds al arrancar, y ni siquiera trae el CLI de
# Prisma (es devDependency: con Prisma Studio pesa más de 300 MB). `prisma
# migrate deploy` y el seed los ejecuta el pipeline de deploy desde el
# checkout del repo, como paso explícito antes de reemplazar el container.

# 1) Compila: dependencias completas (dev incluidas), cliente de Prisma y nest build.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# 2) Solo dependencias de producción. --omit=optional deja afuera los peers
# opcionales de @prisma/client (el CLI `prisma` y `typescript`, que npm
# instalaría igual); el único otro opcional del árbol es pg-cloudflare, que
# solo sirve dentro de Cloudflare Workers.
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

# 3) Runtime: sin compilador, sin devDependencies, sin código fuente TS.
FROM node:22-alpine AS runtime
# NO_COLOR: el logger de Nest no mete códigos ANSI de color en `docker logs`.
ENV NODE_ENV=production \
    PORT=3000 \
    NO_COLOR=1
WORKDIR /app
# Los archivos quedan de root y el proceso corre como `node`: la app no
# necesita escribir en disco (no hay uploads), así que tampoco puede
# modificar su propio código.
COPY --from=prod-deps /app/node_modules ./node_modules
# El cliente que generó `prisma generate` en la etapa de build (prisma-client-js
# lo escribe en node_modules/.prisma, no en un paquete publicado).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
# node directo (no npm start): recibe SIGTERM de `docker stop` sin un
# proceso intermedio, y enableShutdownHooks() cierra ordenadamente.
CMD ["node", "dist/main.js"]
