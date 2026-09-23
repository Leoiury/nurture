# Nurture

Sistema gerencial para clínica.

**Stack:** Next.js (App Router) + TypeScript · Supabase (Postgres, Auth) · Vercel (deploy) · GitHub

## Setup local

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
npm run dev
```

Ou, com acesso ao projeto na Vercel: `npx vercel env pull .env.local`.

## Infra

- **Supabase:** projeto `nurture` (região `sa-east-1`), org Nurture
- **Vercel:** projeto `nurture`; cada push na `main` gera deploy de produção, cada PR gera um preview
- **Migrations:** `supabase/migrations/`, aplicadas com `npx supabase db push`

## Estrutura

- `src/lib/supabase/client.ts`: client para Client Components
- `src/lib/supabase/server.ts`: client para Server Components, Server Actions e Route Handlers
- `src/proxy.ts`: renova a sessão do Supabase a cada requisição
