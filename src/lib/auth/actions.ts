"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_LOGIN_MANUAL, credenciaisDoLoginAutomatico } from "@/lib/auth/login-automatico";
import { normalizarUsuario } from "@/lib/auth/nome-de-usuario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { erro: string; email: string } | undefined;

/** O e-mail do login de um nome de usuário. Quem não está logado não lê usuarios: passa pelo servidor. */
async function emailDoUsuario(usuario: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from("usuarios").select("email").eq("usuario", normalizarUsuario(usuario)).maybeSingle();
    return data?.email ?? null;
  } catch {
    return null;
  }
}

export async function entrar(_: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe o usuário e a senha.", email };

  const supabase = await createClient();
  const emailDoLogin = email.includes("@") ? email : await emailDoUsuario(email);
  // Usuário inexistente e senha errada dão a mesma resposta: a tela não revela quem existe.
  const { error } = emailDoLogin ? await supabase.auth.signInWithPassword({ email: emailDoLogin, password: senha }) : { error: true };
  // O que foi digitado volta no estado porque o React limpa o formulário após a action.
  if (error) return { erro: "Usuário ou senha incorretos.", email };

  redirect("/agenda");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Ambiente de testes local: depois de sair, o formulário vale (para entrar com outro usuário).
  if (credenciaisDoLoginAutomatico()) (await cookies()).set(COOKIE_LOGIN_MANUAL, "1", { path: "/", httpOnly: true, sameSite: "lax" });
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
