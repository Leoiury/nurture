# Nurture

Sistema gerencial para clínica.

**Stack:** Next.js (App Router) + TypeScript · Supabase (Postgres, Auth) · Vercel (deploy) · GitHub

## Desenvolvimento local

O desenvolvimento usa um **Supabase local** (Docker) com dados **fictícios** — nunca o banco de produção.

Pré-requisitos: Node 24, WSL e Docker Desktop (aberto).

```bash
npm install
npm run db:local        # sobe o Supabase local, aplica migrations + seed e configura o .env.development.local
npm run dev             # http://localhost:3000 — login: tests/e2e/usuario-teste.json
```

- `npm run db:local:reset` recria o banco local do zero (migrations + `supabase/seed.sql`).
- `npm run db:local:parar` desliga os containers.
- Studio do banco local: http://127.0.0.1:54323
- Apagando o `.env.development.local`, o `npm run dev` volta a usar a produção (`.env.local`).

## Testes

```bash
npm test                # unitários (Vitest): datas/fuso, layout da grade, cores, visões
npm run test:e2e        # navegador (Playwright), contra o Supabase local
```

Os testes de navegador se recusam a rodar sem o banco local configurado. No GitHub Actions
(`.github/workflows/testes.yml`) tudo roda a cada push, com um Supabase local próprio.

## Infra

- **Supabase:** projeto `nurture` (região `sa-east-1`), org Nurture
- **Vercel:** projeto `nurture`; cada push na `main` gera deploy de produção, cada PR gera um preview
- **Migrations:** `supabase/migrations/`; testadas localmente com `npm run db:local:reset` e aplicadas na produção com `npx supabase db push`

## Backup

Todo dia às 03:00, `.github/workflows/backup.yml` roda `scripts/backup.sh`: dump dos dados e logins da produção, criptografado com `age` e enviado ao Google Drive (`nurture-backups/`). Ficam os últimos 30 dias (`diario/`) e o dia 1º de cada mês por um ano (`mensal/`).

- **Secrets no GitHub:** `SUPABASE_DB_URL` (Session pooler), `BACKUP_AGE_RECIPIENT` (chave pública) e `RCLONE_DRIVE_TOKEN`.
- **Chave privada:** fica fora do GitHub e do Drive. Sem ela, os backups não abrem.
- **Repositório público:** o workflow não pode imprimir dados nem usar `upload-artifact`.
- **Restaurar:** `scripts/restaurar-backup.sh <arquivo.age> <chave-privada> --confirmar` (requer `age`, `psql` e bash). **Apaga os dados atuais do destino.** As tabelas precisam existir: num banco novo, aplique antes as migrations com `npx supabase db push`.

## Estrutura

- `src/lib/supabase/client.ts`: client para Client Components
- `src/lib/supabase/server.ts`: client para Server Components, Server Actions e Route Handlers
- `src/proxy.ts`: renova a sessão do Supabase a cada requisição
