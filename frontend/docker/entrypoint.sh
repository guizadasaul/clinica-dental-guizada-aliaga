#!/bin/sh
set -e

# Mismo motivo que en api/docker/entrypoint.sh: el volumen nombrado de
# node_modules empieza vacío y pisa lo que trae la imagen.
echo "→ Instalando dependencias..."
npm install

echo "→ Iniciando frontend..."
exec "$@"
