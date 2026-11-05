#!/usr/bin/env bash
# Backup dos arquivos do paciente: cada um criptografado com a chave pública age e
# enviado ao Drive uma única vez. Os arquivos são imutáveis, então só vão os novos; os
# excluídos pela tela continuam guardados. Nunca imprime dados: nem os caminhos.
#
# Variáveis: SUPABASE_URL, SUPABASE_SECRET_KEY, BACKUP_AGE_RECIPIENT, BACKUP_DESTINO.
# Restauração: scripts/restaurar-arquivos.sh.
set -euo pipefail

: "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}" "${BACKUP_AGE_RECIPIENT:?}" "${BACKUP_DESTINO:?}"
BUCKET=arquivos-pacientes

pasta=$(mktemp -d)
trap 'rm -rf "$pasta"' EXIT

api() { curl -fsS -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "$@"; }

rclone mkdir "$BACKUP_DESTINO/arquivos"
rclone lsf -R --files-only "$BACKUP_DESTINO/arquivos" | sort > "$pasta/ja-enviados"

# Os registrados no banco, em páginas. Caminhos só têm UUID e extensão.
inicio=0
: > "$pasta/caminhos"
while :; do
  pagina=$(api "$SUPABASE_URL/rest/v1/arquivos_paciente?select=caminho&order=id&limit=1000&offset=$inicio")
  linhas=$(printf '%s' "$pagina" | { grep -o '"caminho":"[^"]*"' || true; } | sed 's/"caminho":"//; s/"$//')
  [ -n "$linhas" ] || break
  printf '%s\n' "$linhas" >> "$pasta/caminhos"
  inicio=$((inicio + 1000))
done

novos=0
falhas=0
while IFS= read -r caminho; do
  [ -n "$caminho" ] || continue
  if grep -qxF "$caminho.age" "$pasta/ja-enviados"; then continue; fi
  if api "$SUPABASE_URL/storage/v1/object/$BUCKET/$caminho" | age -r "$BACKUP_AGE_RECIPIENT" -o "$pasta/atual.age" \
    && rclone copyto "$pasta/atual.age" "$BACKUP_DESTINO/arquivos/$caminho.age"; then
    novos=$((novos + 1))
  else
    falhas=$((falhas + 1))
  fi
done < "$pasta/caminhos"

total=$(grep -c . "$pasta/caminhos" || true)
echo "Arquivos: $total registrados, $novos novos enviados, $falhas com falha."
# Falha aqui avisa por e-mail, sem impedir os outros arquivos da rodada.
[ "$falhas" -eq 0 ]
