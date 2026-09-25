#!/usr/bin/env bash
# Falla si un workflow de GitHub Actions o un script de deploy ejecuta un
# comando de base de datos destructivo. Contra staging y producción solo se
# permite `prisma migrate deploy` (aplica lo pendiente, nunca borra) y seeds
# idempotentes; `migrate reset`/`db push`/`supabase db reset` pueden borrar
# datos o saltearse el historial de migraciones. `migrate dev` además es
# interactivo y puede resetear la base si detecta drift.
#
# Lo corre ci.yml (job db-safety). Este archivo no se escanea a sí mismo.
set -euo pipefail

cd "$(dirname "$0")/.."

pattern='prisma[[:space:]]+(migrate[[:space:]]+(reset|dev)|db[[:space:]]+push)|supabase[[:space:]]+db[[:space:]]+(reset|push)|--force-reset|--accept-data-loss'

targets=(.github/workflows)
[ -d deploy ] && targets+=(deploy)

if grep -rEn --include='*.yml' --include='*.yaml' --include='*.sh' "$pattern" "${targets[@]}"; then
  echo "✗ Comando de base destructivo en un workflow o script de deploy (ver arriba)."
  echo "  Contra ambientes remotos solo se permite 'prisma migrate deploy' y seeds idempotentes."
  exit 1
fi
echo "✓ Sin comandos de base destructivos en workflows ni scripts de deploy"
