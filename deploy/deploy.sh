#!/usr/bin/env bash
# Despliega una imagen de la API en un ambiente del VPS y verifica que quede
# sana; si no, vuelve a la versión anterior.
#
#   /opt/clinic/deploy.sh <staging|production> <tag>
#
# <tag> es un tag de ghcr.io/guizadasaul/clinic-api (el pipeline usa el SHA
# del commit, que es inmutable). Rollback manual = volver a correrlo con el
# tag anterior (queda anotado en <ambiente>/previous.env).
#
# No toca la base de datos: las migraciones las aplica antes el workflow
# "DB migrate". Al volver a una imagen anterior, la base queda con el schema
# nuevo — por eso las migraciones tienen que ser aditivas.
set -euo pipefail

usage() {
  echo "Uso: $0 <staging|production> <tag>" >&2
  exit 2
}

[ $# -eq 2 ] || usage
env="$1"
tag="$2"
case "$env" in
  staging | production) ;;
  *) usage ;;
esac
[[ "$tag" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Tag inválido: $tag" >&2; exit 2; }

dir="$(cd "$(dirname "$0")" && pwd)/$env"
container="clinic-api-$env"
cd "$dir"

[ -f .env ] || { echo "Falta $dir/.env (ver .env.example)" >&2; exit 1; }

# Espera a que la API responda /health/ready (la base también responde).
ready() {
  for _ in $(seq 1 30); do
    if docker exec "$container" wget -qO- "http://127.0.0.1:3000/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# `up` con un tag fijo: --pull missing baja la imagen si no está (un tag por
# SHA no cambia nunca, no hace falta volver a bajarlo). --wait espera al
# healthcheck de la imagen (/health).
up() {
  API_TAG="$1" docker compose up -d --pull missing --wait --wait-timeout 120
}

previous=""
if [ -f current.env ]; then
  previous="$(sed -n 's/^API_TAG=//p' current.env)"
fi

echo "→ Desplegando $container:$tag (anterior: ${previous:-ninguna})"
if up "$tag" && ready; then
  [ -n "$previous" ] && echo "API_TAG=$previous" > previous.env
  echo "API_TAG=$tag" > current.env
  echo "✓ $container:$tag sano (/health/ready ok)"
  exit 0
fi

echo "✗ $container:$tag no quedó sano. Últimos logs:" >&2
docker logs --tail 50 "$container" >&2 || true

if [ -n "$previous" ] && [ "$previous" != "$tag" ]; then
  echo "→ Volviendo a $container:$previous" >&2
  if up "$previous" && ready; then
    echo "↩ Rollback a $previous ok; el deploy de $tag falló." >&2
  else
    echo "✗ El rollback a $previous tampoco quedó sano: revisar a mano." >&2
  fi
fi
exit 1
