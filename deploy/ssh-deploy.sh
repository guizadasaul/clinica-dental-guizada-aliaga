#!/usr/bin/env bash
# Único comando que puede ejecutar la clave SSH de deploy del pipeline.
# Se fija en ~/.ssh/authorized_keys del VPS, una clave por ambiente:
#
#   command="/opt/clinic/ssh-deploy.sh staging",restrict ssh-ed25519 AAAA... deploy-staging
#
# `restrict` quita shell interactiva, túneles, agent y X11 forwarding; el
# ambiente sale de authorized_keys (no del cliente), así que la clave de
# staging no puede desplegar producción. Lo que manda el pipeline
# (SSH_ORIGINAL_COMMAND) es solo el tag; deploy.sh lo valida contra
# ^[A-Za-z0-9._-]+$ antes de usarlo, y no hay forma de ejecutar otra cosa.
set -euo pipefail

env="${1:?falta el ambiente en authorized_keys}"
tag="${SSH_ORIGINAL_COMMAND:-}"

if [ -z "$tag" ]; then
  echo "Uso: ssh <host> <tag>  (solo despliega en $env)" >&2
  exit 2
fi

exec "$(cd "$(dirname "$0")" && pwd)/deploy.sh" "$env" "$tag"
