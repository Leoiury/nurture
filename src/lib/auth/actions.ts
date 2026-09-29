"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { erro: string; email: string } | undefined;

export async function entrar(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  // O e-mail volta no estado porque o React limpa o formulário após a action.
  if (error) return { erro: "E-mail ou senha incorretos.", email };

  redirect("/agenda");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type EstadoSenha = { ok: boolean; mensagem: string } | undefined;

/** Troca a senha do próprio usuário (Minha conta). */
export async function trocarSenha(_: EstadoSenha, formData: FormData): Promise<EstadoSenha> {
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");
  if (senha.length < 8) return { ok: false, mensagem: "A senha precisa ter ao menos 8 caracteres." };
  if (senha !== confirmacao) return { ok: false, mensagem: "As duas senhas não são iguais." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return { ok: false, mensagem: /different|same/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha." };
  return { ok: true, mensagem: "Senha trocada." };
}
