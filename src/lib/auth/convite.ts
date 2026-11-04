import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { identificacaoDoLogin } from "@/lib/auth/nome-de-usuario";
import type { TipoDeLink } from "@/lib/auth/mensagem-do-link";
import { createAdminClient } from "@/lib/supabase/admin";

// Links de acesso: criar o próprio login ou redefinir a senha. Uso único: o token só
// existe no link, e o banco guarda o hash dele.

/** Redefinir senha vale menos: quem usa o link assume um login que já existe. */
const HORAS_DE_VALIDADE: Record<TipoDeLink, number> = { login: 7 * 24, senha: 24 };

export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function novoToken(tipo: TipoDeLink = "login") {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDoToken(token), expiraEm: new Date(Date.now() + HORAS_DE_VALIDADE[tipo] * 3_600_000).toISOString() };
}

const formatoValido = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export type DadosDoLink = { tipo: "login"; nome: string } | { tipo: "senha"; nome: string; login: string };

/** O que a página do link precisa, se ele ainda valer. Abrir o link não o gasta. */
export async function dadosDoLink(token: string): Promise<DadosDoLink | null> {
  if (!formatoValido(token)) return null;
  const { data } = await createAdminClient()
    .from("convites")
    .select("tipo, profissional:profissionais(nome, ativo), usuario:usuarios(usuario, email, ativo)")
    .eq("token_hash", hashDoToken(token))
    .is("usado_em", null)
    .is("revogado_em", null)
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  if (!data?.profissional.ativo) return null;
  if (data.tipo !== "senha") return { tipo: "login", nome: data.profissional.nome };
  return data.usuario?.ativo ? { tipo: "senha", nome: data.profissional.nome, login: identificacaoDoLogin(data.usuario) } : null;
}

/** Gasta o link de uma vez: dois envios ao mesmo tempo não usam o mesmo link duas vezes. */
export async function reservarConvite(token: string, tipo: TipoDeLink) {
  if (!formatoValido(token)) return null;
  const { data } = await createAdminClient()
    .from("convites")
    .update({ usado_em: new Date().toISOString() })
    .eq("token_hash", hashDoToken(token))
    .eq("tipo", tipo)
    .is("usado_em", null)
    .is("revogado_em", null)
    .gt("expira_em", new Date().toISOString())
    .select("id, profissional_id, perfil, usuario_id, profissional:profissionais(nome, ativo, email)")
    .maybeSingle();
  return data;
}
