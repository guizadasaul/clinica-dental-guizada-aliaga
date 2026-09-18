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

# Solo para quien evalúa/demuestra el proyecto en una base limpia: crea un
# usuario por rol. Apagado por defecto para no tocar la base de desarrollo real.
if [ "$SEED_DEMO" = "true" ]; then
  echo "→ Sembrando usuarios de demo (SEED_DEMO=true)..."
  npx ts-node prisma/seed-demo.ts
fi

echo "→ Iniciando API..."
exec "$@"
