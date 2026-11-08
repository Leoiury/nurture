#!/usr/bin/env bash
# Devolve ao Storage os arquivos de scripts/backup-arquivos.sh. Sobrescreve os do destino.
#
#   scripts/restaurar-arquivos.sh <chave-privada> --confirmar
#
# Variáveis: SUPABASE_URL, SUPABASE_SECRET_KEY, BACKUP_DESTINO. O bucket vem das
# migrations; os registros vêm de scripts/restaurar-backup.sh.
set -euo pipefail

chave="${1:?Informe o arquivo da chave privada}"
[ "${2:-}" = "--confirmar" ] || { echo "Isto sobrescreve os arquivos do destino. Repita com --confirmar." >&2; exit 1; }
: "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}" "${BACKUP_DESTINO:?}"
BUCKET=arquivos-pacientes

pasta=$(mktemp -d)
trap 'rm -rf "$pasta"' EXIT

total=0
while IFS= read -r arquivo; do
  caminho="${arquivo%.age}"
  case "${caminho##*.}" in
    pdf) tipo=application/pdf ;;
    doc) tipo=application/msword ;;
    docx) tipo=application/vnd.openxmlformats-officedocument.wordprocessingml.document ;;
    *) echo "Tipo inesperado no backup." >&2; exit 1 ;;
  esac
  rclone copyto "$BACKUP_DESTINO/arquivos/$arquivo" "$pasta/atual.age"
  age -d -i "$chave" "$pasta/atual.age" > "$pasta/atual"
  curl -fsS -o /dev/null -X POST \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H "Content-Type: $tipo" -H "x-upsert: true" \
    --data-binary "@$pasta/atual" "$SUPABASE_URL/storage/v1/object/$BUCKET/$caminho"
  total=$((total + 1))
done < <(rclone lsf -R --files-only "$BACKUP_DESTINO/arquivos")

echo "$total arquivos restaurados."
