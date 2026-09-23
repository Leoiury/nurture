// Cria um usuário do sistema (o cadastro público está desativado).
//
// Uso:  npm run usuario:criar -- <email> <perfil> [nome]
//       perfil: direcao | dev
//
// A senha é gerada aleatoriamente e mostrada uma única vez. O usuário pode
// trocá-la depois de entrar.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PERFIS = ["direcao", "dev"] as const;
type Perfil = (typeof PERFIS)[number];

const [email, perfil, ...nome] = process.argv.slice(2);
if (!email || !PERFIS.includes(perfil as Perfil)) {
  console.error("Uso: npm run usuario:criar -- <email> <direcao|dev> [nome]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local");
const db = createClient(url, secret, { auth: { persistSession: false } });

const senha = randomBytes(12).toString("base64url");
const { data, error } = await db.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  // app_metadata só pode ser alterado com a secret key; o usuário não consegue mudar o próprio perfil.
  app_metadata: { perfil },
  user_metadata: { nome: nome.join(" ") || null },
});
if (error) throw new Error(error.message);

console.log(`Usuário criado: ${data.user.email} (perfil: ${perfil})`);
console.log(`Senha: ${senha}`);
