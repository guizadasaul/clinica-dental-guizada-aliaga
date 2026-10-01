#!/usr/bin/env bash
# Restaura un backup de producción (lo genera .github/workflows/backup-production.yml).
#
#   deploy/backup/restore.sh <backup.tar.age> <clave-privada-age> <DATABASE_URL destino> [--with-auth]
#
# - <backup.tar.age>: bajado de Cloudflare R2 (bucket → production/AAAA/MM/).
# - <clave-privada-age>: el archivo de `age-keygen` guardado en el gestor de
#   contraseñas. Nunca queda en el repo ni en el servidor.
# - <DATABASE_URL destino>: la base donde restaurar. Para probar un backup, una
#   base vacía local (ver deploy/README.md → Backups). Restaurar sobre Supabase
#   pide confirmación escribiendo el host.
# - --with-auth: además restaura auth.users/auth.identities (solo tiene sentido
#   en un proyecto de Supabase, que tiene el schema auth).
#
# Borra y recrea los objetos del schema public que vienen en el backup
# (pg_restore --clean): no usarlo sobre una base con datos que importen.
# Necesita `age` y `pg_restore` (Postgres 17 o más nuevo) instalados.
set -euo pipefail

usage() {
  echo "Uso: $0 <backup.tar.age> <clave-privada-age> <DATABASE_URL destino> [--with-auth]" >&2
  exit 2
}

[ $# -ge 3 ] || usage
archive="$1"
key="$2"
target="$3"
with_auth="${4:-}"
[ -z "$with_auth" ] || [ "$with_auth" = "--with-auth" ] || usage

for cmd in age pg_restore psql; do
  command -v "$cmd" >/dev/null || { echo "Falta $cmd (brew install age / postgresql)" >&2; exit 1; }
done
[ -f "$archive" ] || { echo "No existe $archive" >&2; exit 1; }
[ -f "$key" ] || { echo "No existe $key" >&2; exit 1; }

host="$(printf '%s' "$target" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/?]+).*#\2#')"
if printf '%s' "$host" | grep -q 'supabase\.com$'; then
  echo "⚠️  El destino es una base de Supabase ($host): se van a BORRAR y recrear sus tablas." >&2
  read -r -p "Para seguir, escribí el host exacto: " confirm
  [ "$confirm" = "$host" ] || { echo "Cancelado." >&2; exit 1; }
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

age -d -i "$key" -o "$work/backup.tar" "$archive"
tar -C "$work" -xf "$work/backup.tar"
[ -f "$work/public.dump" ] || { echo "El backup no trae public.dump" >&2; exit 1; }

# pg_restore genera el SQL y psql lo aplica en una sola transacción. Se saca
# `SET transaction_timeout` (lo emite pg_dump 17+ y Postgres 16 no lo
# conoce), así el mismo backup se restaura en cualquier versión de destino.
restore_sql() {
  sed '/^SET transaction_timeout/d' | psql "$target" --quiet --single-transaction \
    --set ON_ERROR_STOP=1 >/dev/null
}

echo "→ Restaurando schema public en $host"
pg_restore --file=- --no-owner --no-privileges --clean --if-exists \
  "$work/public.dump" | restore_sql

if [ "$with_auth" = "--with-auth" ]; then
  if [ -f "$work/auth.dump" ]; then
    echo "→ Restaurando auth.users y auth.identities"
    pg_restore --file=- --no-owner --data-only "$work/auth.dump" | restore_sql
  else
    echo "⚠️  El backup no trae auth.dump (el volcado de Supabase Auth no tuvo permisos)." >&2
  fi
fi

echo "✓ Restaurado. Tablas en public: $(psql "$target" -Atc "select count(*) from pg_tables where schemaname = 'public'")"
