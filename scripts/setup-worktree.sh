#!/usr/bin/env bash
# Deja un worktree recién creado listo para trabajar: copia los archivos que
# .gitignore excluye a propósito (CLAUDE.md, .claude/, .mcp.json, api/.env) desde
# el worktree principal, e instala dependencias en api/ y frontend/.
#
# Idempotente — no pisa nada que ya exista, así que correrlo de nuevo en un
# worktree ya preparado no hace daño. Se invoca sola desde el hook
# post-checkout en cada `git worktree add`; también se puede correr a mano.

set -uo pipefail

COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "$COMMON_DIR")"
CURRENT_ROOT="$(git rev-parse --show-toplevel)"

if [ "$CURRENT_ROOT" = "$MAIN_ROOT" ]; then
  exit 0
fi

echo "Preparando worktree en $CURRENT_ROOT..."

# Si la rama del worktree nace desde un main local desactualizado (por
# ejemplo porque Orca u otro flujo la crea a partir de la rama `main` local
# sin haber hecho fetch antes), esto la pone al día con origin/main. Solo
# actúa si la rama todavía no tiene commits propios encima de origin/main
# (HEAD == merge-base): en ese caso mover HEAD es un fast-forward puro, sin
# riesgo de pisar nada. Si la rama ya tiene commits propios, no toca nada.
git fetch origin main --quiet 2>/dev/null
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  head_sha="$(git rev-parse HEAD)"
  origin_sha="$(git rev-parse origin/main)"
  merge_base="$(git merge-base HEAD origin/main 2>/dev/null || true)"
  if [ "$head_sha" != "$origin_sha" ] && [ "$head_sha" = "$merge_base" ]; then
    if git merge --ff-only origin/main --quiet 2>/dev/null; then
      echo "  rama actualizada a origin/main ($origin_sha)"
    fi
  fi
fi

copy_if_missing() {
  local rel_path="$1"
  local src="$MAIN_ROOT/$rel_path"
  local dest="$CURRENT_ROOT/$rel_path"
  if [ -e "$src" ] && [ ! -e "$dest" ]; then
    cp -R "$src" "$dest" && echo "  copiado: $rel_path"
  fi
}

copy_if_missing "CLAUDE.md"
copy_if_missing ".mcp.json"
copy_if_missing ".claude"

# api/.env se copia (no symlink: Docker bind-mountea solo <worktree>/api hacia
# adentro del contenedor, así que un symlink a otro worktree o al principal
# queda roto adentro del contenedor — probado y descartado). La defensa real
# contra el drift es mantener ESTE archivo (el del worktree principal, la
# plantilla de la que copian todos los worktrees nuevos) siempre completo:
# cualquier env var nueva que se agregue en un worktree de feature debe
# replicarse acá también, o todo worktree nuevo nace incompleto otra vez.
copy_if_missing "api/.env"

if [ ! -d "$CURRENT_ROOT/api/node_modules" ]; then
  echo "  instalando dependencias de api/..."
  (cd "$CURRENT_ROOT/api" && npm install) || echo "  aviso: fallo 'npm install' en api/"
fi

if [ ! -d "$CURRENT_ROOT/frontend/node_modules" ]; then
  echo "  instalando dependencias de frontend/..."
  (cd "$CURRENT_ROOT/frontend" && npm install) || echo "  aviso: fallo 'npm install' en frontend/"
fi

if [ -d "$CURRENT_ROOT/api/node_modules" ] && [ -f "$CURRENT_ROOT/api/prisma/schema.prisma" ]; then
  (cd "$CURRENT_ROOT/api" && npx prisma generate >/dev/null 2>&1) && echo "  cliente de Prisma generado"
fi

echo "Worktree listo."
