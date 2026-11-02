#!/usr/bin/env bash
# Backup do banco: dump completo (dados e logins), criptografado com a chave pública
# age e enviado ao Drive. O repositório é público e os logs ficam visíveis: este
# script nunca imprime dados, e o arquivo sem criptografia não sai da pasta temporária.
#
# Variáveis: SUPABASE_DB_URL, BACKUP_AGE_RECIPIENT, BACKUP_DESTINO (ex.: drive:nurture-backups).
# Restauração: scripts/restaurar-backup.sh.
set -euo pipefail

: "${SUPABASE_DB_URL:?}" "${BACKUP_AGE_RECIPIENT:?}" "${BACKUP_DESTINO:?}"
SUPABASE="${SUPABASE_CLI:-supabase}"

hoje=$(TZ=America/Sao_Paulo date +%F)
pasta=$(mktemp -d)
trap 'rm -rf "$pasta"' EXIT
mkdir "$pasta/nurture"

# Os mesmos três arquivos da migração oficial do Supabase. A restauração usa o data.sql;
# roles.sql e schema.sql conferem o estado do banco naquele dia. O app não usa o
# Storage, e as tabelas internas dele não podem ser restauradas.
$SUPABASE db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$pasta/nurture/roles.sql"
$SUPABASE db dump --db-url "$SUPABASE_DB_URL" -f "$pasta/nurture/schema.sql"
$SUPABASE db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy --schema public,auth -f "$pasta/nurture/data.sql"

# Um dump quebrado não pode substituir os backups bons (a limpeza vem depois do envio).
for tabela in pacientes atendimentos; do
  grep -q "^COPY \"public\".\"$tabela\"" "$pasta/nurture/data.sql" || { echo "Dump sem a tabela $tabela." >&2; exit 1; }
done
grep -q '^COPY "auth"."users"' "$pasta/nurture/data.sql" || { echo "Dump sem os logins." >&2; exit 1; }

arquivo="$pasta/nurture-$hoje.tar.gz.age"
tar -czf - -C "$pasta" nurture | age -r "$BACKUP_AGE_RECIPIENT" -o "$arquivo"

rclone copyto "$arquivo" "$BACKUP_DESTINO/diario/nurture-$hoje.tar.gz.age"
# O primeiro de cada mês fica guardado por um ano.
if [ "${hoje:8:2}" = "01" ]; then
  rclone copyto "$arquivo" "$BACKUP_DESTINO/mensal/nurture-${hoje:0:7}.tar.gz.age"
fi

# Na primeira execução, a pasta mensal ainda não existe.
rclone mkdir "$BACKUP_DESTINO/mensal"
rclone delete "$BACKUP_DESTINO/diario" --min-age 30d
rclone delete "$BACKUP_DESTINO/mensal" --min-age 365d

echo "Backup de $hoje enviado ($(du -h "$arquivo" | cut -f1))."
