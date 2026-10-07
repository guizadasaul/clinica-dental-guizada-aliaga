#!/usr/bin/env bash
# Falla si un texto que ve el usuario usa voseo (español rioplatense). La
# clínica es de Bolivia y la app habla en español neutro, tuteando (CLI-172..175):
# "Reserva", "Elige", "puedes", "aquí" — no "Reservá", "Elegí", "podés", "acá".
#
# Revisa el es.json, las plantillas .html y los .ts de frontend/src y api/src.
# Ignora specs, e2e, comentarios y los payloads de prueba de prompt injection
# (son mensajes de un atacante simulado, no salida de la app). La lista es
# acotada a formas sin ambigüedad para no dar falsos positivos.
#
# Lo corre ci.yml (job db-safety).
set -euo pipefail

cd "$(dirname "$0")/.."

forms='Reservá|Elegí|Probá|Escaneá|Tocá|Ingresá|Completá|Revisá|Intentá|Esperá|Volvé|Hacé|Mirá|Usá|Cargá|Seleccioná|Confirmá|Guardá|Escribí|Agregá|Buscá|Creá|Verificá|Solicitá|Pedí|Iniciá|Generá|Explicá|Describí|Dejá|Definí|Cerrá|Cancelá|Apretá|Actualizá|Accedé|Copiá|Pegá|Contanos|Dejanos|Escribinos|Contactanos|Encontranos|Llamanos|Sumate|Unite|Registrate|Pedile|Mostrale|Verificalo|Dejalo|Buscalo|Buscala|podés|tenés|querés|sabés|preferís|llevás|usás|necesitás'
# Delimitadores de palabra que entienden tildes (grep -w no las considera letras).
pattern="(^|[^[:alnum:]áéíóúÁÉÍÓÚñÑ])(${forms}|acá)([^[:alnum:]áéíóúÁÉÍÓÚñÑ]|$)"

files=$(
  {
    echo frontend/public/assets/i18n/es.json
    find frontend/src api/src -type f \( -name '*.ts' -o -name '*.html' \) \
      ! -name '*.spec.ts' ! -name '*.e2e-spec.ts' ! -name 'prompt-injection-payloads.ts'
  } | sort
)

# Líneas de comentario (// … , * … , /* … , <!-- …) no las ve el usuario.
matches="$(echo "$files" | xargs grep -nE "$pattern" \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*|<!--)' || true)"

if [ -n "$matches" ]; then
  echo "$matches"
  echo "✗ Texto con voseo en la app (ver arriba). Usa español neutro tuteando: Reserva, Elige, puedes, aquí." >&2
  exit 1
fi
echo "✓ Sin voseo en los textos de la app"
