import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Convite para o profissional criar o próprio login. Link de uso único: o token só
// existe no link, e o banco guarda o hash dele.

export const DIAS_DE_VALIDADE = 7;

export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function novoToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDoToken(token), expiraEm: new Date(Date.now() + DIAS_DE_VALIDADE * 86_400_000).toISOString() };
}

const formatoValido = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** O nome do profissional, se o link ainda valer. Abrir o link não o gasta. */
export async function profissionalDoConvite(token: string): Promise<string | null> {
  if (!formatoValido(token)) return null;
  const { data } = await createAdminClient()
    .from("convites")
    .select("profissional:profissionais(nome, ativo)")
    .eq("token_hash", hashDoToken(token))
    .is("usado_em", null)
    .is("revogado_em", null)
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  return data?.profissional.ativo ? data.profissional.nome : null;
}

/** Gasta o link de uma vez: dois envios ao mesmo tempo não criam dois logins. */
export async function reservarConvite(token: string) {
  if (!formatoValido(token)) return null;
  const { data } = await createAdminClient()
    .from("convites")
    .update({ usado_em: new Date().toISOString() })
    .eq("token_hash", hashDoToken(token))
    .is("usado_em", null)
    .is("revogado_em", null)
    .gt("expira_em", new Date().toISOString())
    .select("id, profissional_id, profissional:profissionais(nome, ativo)")
    .maybeSingle();
  return data;
}
