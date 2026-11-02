#!/usr/bin/env bash
# Restaura um backup de scripts/backup.sh. APAGA os dados atuais do banco de destino.
#
#   scripts/restaurar-backup.sh <arquivo.age> <chave-privada> --confirmar
#
# O destino vem de PSQL (padrão: psql, conectado via PGHOST/PGPASSWORD etc.). As
# tabelas precisam existir: num banco novo, aplique antes as migrations do commit
# da época (npx supabase db push), que também criam os gatilhos em auth.users.
set -euo pipefail

arquivo="${1:?Informe o arquivo .age}"
chave="${2:?Informe o arquivo da chave privada}"
[ "${3:-}" = "--confirmar" ] || { echo "Isto apaga os dados atuais do destino. Repita com --confirmar." >&2; exit 1; }
PSQL="${PSQL:-psql}"

pasta=$(mktemp -d)
trap 'rm -rf "$pasta"' EXIT
age -d -i "$chave" "$arquivo" | tar -xzf - -C "$pasta"
dados="$pasta/nurture/data.sql"

# Limpa só as tabelas que o backup traz, tudo em uma transação: se falhar, nada muda.
tabelas=$(sed -n 's/^COPY \("[^"]*"\."[^"]*"\).*/\1/p' "$dados" | paste -sd, -)
{
  echo "begin;"
  echo "truncate $tabelas cascade;"
  cat "$dados"
  echo "commit;"
} | $PSQL -q -v ON_ERROR_STOP=1 > /dev/null

echo "Backup restaurado."
