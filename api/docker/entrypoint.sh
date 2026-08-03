#!/bin/sh
set -e

# El volumen nombrado de node_modules empieza vacío en el primer arranque
# (pisa lo que trae la imagen), así que reinstalar acá es necesario, no
# redundante. npm es rápido si el lockfile no cambió.
echo "→ Instalando dependencias..."
npm install

echo "→ Generando Prisma Client..."
npx prisma generate

echo "→ Aplicando migraciones pendientes..."
npx prisma migrate deploy

echo "→ Sembrando datos base (idempotente)..."
npx prisma db seed

echo "→ Iniciando API..."
exec "$@"
