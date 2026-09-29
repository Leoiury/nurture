"use server";

// Usuários (só ADM): criar login com senha provisória, mudar perfil/vínculo,
// desativar (bloqueia o login) e gerar nova senha provisória.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ehAdm, usuarioAtual, type Perfil } from "@/lib/auth/usuario";
import { createAdminClient } from "@/lib/supabase/admin";

type Falha = { ok: false; erro: string };

export type NovoUsuario = { nome: string; email: string; perfil: Perfil; profissionalId: string | null };
export type EdicaoDeUsuario = { id: string; nome: string; perfil: Perfil; profissionalId: string | null; ativo: boolean };

/** 12 caracteres fáceis de digitar (sem 0/O, 1/l/I). */
function senhaProvisoria(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(12), (b) => letras[b % letras.length]).join("");
}

const PERFIS: Perfil[] = ["adm", "limitado"];
/** Login bloqueado enquanto o usuário estiver inativo (~100 anos). */
const BLOQUEIO = "876000h";

function revalidar() {
  revalidatePath("/configuracoes/usuarios");
}

export async function criarUsuario(u: NovoUsuario): Promise<{ ok: true; email: string; senha: string } | Falha> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores cadastram usuários." };
  const nome = u.nome.trim().replace(/\s+/g, " ");
  const email = u.email.trim().toLowerCase();
  if (nome.length < 3) return { ok: false, erro: "Informe o nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "E-mail inválido." };
  if (!PERFIS.includes(u.perfil)) return { ok: false, erro: "Perfil inválido." };

  const admin = createAdminClient();
  const senha = senhaProvisoria();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
    app_metadata: { perfil: u.perfil },
  });
  if (error) return { ok: false, erro: /already|registered|exists/i.test(error.message) ? "Já existe um usuário com esse e-mail." : "Não foi possível criar o login." };

  // A linha em usuarios nasce pelo gatilho do login; aqui completa perfil e vínculo.
  const { error: erroPerfil } = await admin
    .from("usuarios")
    .update({ nome, perfil: u.perfil, profissional_id: u.profissionalId || null })
    .eq("id", data.user.id);
  if (erroPerfil) return { ok: false, erro: "O login foi criado, mas não foi possível gravar o perfil." };

  revalidar();
  return { ok: true, email, senha };
}

export async function atualizarUsuario(u: EdicaoDeUsuario): Promise<{ ok: true } | Falha> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores alteram usuários." };
  const nome = u.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 3) return { ok: false, erro: "Informe o nome." };
  if (!PERFIS.includes(u.perfil)) return { ok: false, erro: "Perfil inválido." };

  const eu = await usuarioAtual();
  if (u.id === eu?.id && (u.perfil !== "adm" || !u.ativo)) return { ok: false, erro: "Você não pode tirar o seu próprio acesso de administrador." };

  const admin = createAdminClient();
  // Sempre fica ao menos um ADM ativo.
  if (u.perfil !== "adm" || !u.ativo) {
    const { data: adms } = await admin.from("usuarios").select("id").eq("perfil", "adm").eq("ativo", true);
    if ((adms ?? []).every((a) => a.id === u.id)) return { ok: false, erro: "É preciso manter ao menos um administrador ativo." };
  }

  const { error } = await admin.from("usuarios").update({ nome, perfil: u.perfil, profissional_id: u.profissionalId || null, ativo: u.ativo }).eq("id", u.id);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  // Inativo: o login fica bloqueado (as sessões abertas caem ao renovar o token).
  const { error: erroLogin } = await admin.auth.admin.updateUserById(u.id, { ban_duration: u.ativo ? "none" : BLOQUEIO, app_metadata: { perfil: u.perfil } });
  if (erroLogin) return { ok: false, erro: "Salvo, mas não foi possível atualizar o bloqueio do login." };

  revalidar();
  return { ok: true };
}

export async function gerarNovaSenha(id: string): Promise<{ ok: true; senha: string } | Falha> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores geram senhas." };
  const senha = senhaProvisoria();
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: senha });
  if (error) return { ok: false, erro: "Não foi possível gerar a senha." };
  return { ok: true, senha };
}
