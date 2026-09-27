// Liga o app ao Supabase LOCAL (Docker) em vez do de produção.
//
// Uso:  npm run db:local         (sobe o Supabase local e roda este script)
//
// 1. Lê URL e chaves do `supabase status`.
// 2. Grava .env.development.local — o `npm run dev` passa a usar o banco local
//    (esse arquivo tem prioridade sobre o .env.local, que continua apontando para
//    a produção e é usado só pelos scripts de importação e de usuários).
// 3. Cria o usuário de teste (tests/e2e/usuario-teste.json), se não existir.
//
// Com --ci também grava .env.production.local, para `next build`/`next start`.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" }),
);

// Os nomes das chaves variam entre versões do CLI (publishable/anon, secret/service_role).
const url = status.API_URL;
const publica = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const secreta = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
if (!url || !publica || !secreta) {
  throw new Error(`Supabase local sem URL/chaves. Ele está rodando? (npx supabase start)\n${JSON.stringify(status, null, 2)}`);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`URL não é local: ${url}`);

const conteudo = `# Gerado por scripts/ambiente-local.mjs — Supabase LOCAL (dados fictícios).
# Apague este arquivo para o \`npm run dev\` voltar a usar a produção (.env.local).
NEXT_PUBLIC_SUPABASE_URL=${url}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publica}
SUPABASE_SECRET_KEY=${secreta}
`;
writeFileSync(".env.development.local", conteudo);
if (process.argv.includes("--ci")) writeFileSync(".env.production.local", conteudo);
console.log(`Ambiente local configurado: ${url}`);

const { email, senha } = JSON.parse(readFileSync("tests/e2e/usuario-teste.json", "utf8"));
const db = createClient(url, secreta, { auth: { persistSession: false } });
const { error } = await db.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  app_metadata: { perfil: "dev" },
});
if (error && !/already|registered|exists/i.test(error.message)) throw error;
console.log(`Usuário de teste: ${email} / ${senha}`);
