// Gera os tipos TypeScript do banco LOCAL (onde as migrations são aplicadas
// primeiro) e só grava o arquivo se a geração der certo — um erro não pode
// sobrescrever os tipos com a mensagem de erro.
//
// Uso:  npm run db:types   (com o Supabase local rodando: npm run db:local)

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const DESTINO = "src/lib/supabase/database.types.ts";
const BANCO_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const tipos = execSync(`npx supabase gen types typescript --db-url "${BANCO_LOCAL}"`, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

if (!tipos.startsWith("export type Json")) {
  console.error(tipos.slice(0, 500));
  throw new Error("Geração de tipos falhou; o arquivo não foi alterado. O Supabase local está rodando?");
}

writeFileSync(DESTINO, tipos);
console.log(`Tipos gravados em ${DESTINO}`);
