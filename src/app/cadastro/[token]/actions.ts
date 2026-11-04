"use server";

// O link de acesso: criar o login ou redefinir a senha. Quem entra aqui ainda não tem
// sessão, e o que autoriza é o próprio link. O perfil vem do link, nunca do formulário.

import { redirect } from "next/navigation";
import { reservarConvite } from "@/lib/auth/convite";
import { emailInterno, normalizarUsuario, usuarioValido } from "@/lib/auth/nome-de-usuario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoDoCadastro = { erro: string; usuario: string } | undefined;

const LINK_INVALIDO = "Este link não vale mais. Peça um novo à clínica.";
const USUARIO_EM_USO = "Esse nome de usuário já está em uso. Escolha outro.";

function erroDaSenha(senha: string, confirmacao: string) {
  if (senha.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
  if (senha !== confirmacao) return "As duas senhas não são iguais.";
  return null;
}

export async function concluirCadastro(token: string, _: EstadoDoCadastro, formData: FormData): Promise<EstadoDoCadastro> {
  const usuario = normalizarUsuario(String(formData.get("usuario") ?? ""));
  const senha = String(formData.get("senha") ?? "");
  if (!usuarioValido(usuario)) return { erro: "O nome de usuário precisa ter de 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.", usuario };
  const erroSenha = erroDaSenha(senha, String(formData.get("confirmacao") ?? ""));
  if (erroSenha) return { erro: erroSenha, usuario };

  const convite = await reservarConvite(token, "login");
  if (!convite || !convite.perfil || !convite.profissional.ativo) return { erro: LINK_INVALIDO, usuario };

  const admin = createAdminClient();
  // Qualquer falha daqui em diante devolve o link, para a pessoa tentar de novo.
  const falhar = async (erro: string): Promise<EstadoDoCadastro> => {
    await admin.from("convites").update({ usado_em: null }).eq("id", convite.id);
    return { erro, usuario };
  };

  const { count } = await admin.from("usuarios").select("id", { count: "exact", head: true }).eq("profissional_id", convite.profissional_id).eq("ativo", true);
  if (count) return falhar("Este profissional já tem um login. Fale com a clínica.");
  const { count: emUso } = await admin.from("usuarios").select("id", { count: "exact", head: true }).eq("usuario", usuario);
  if (emUso) return falhar(USUARIO_EM_USO);

  const { nome, email: emailDoCadastro } = convite.profissional;
  const { perfil } = convite;
  // O e-mail do cadastro, se estiver livre; senão, o interno.
  let email = "";
  let id = "";
  for (const tentativa of [emailDoCadastro?.trim().toLowerCase(), emailInterno(usuario)]) {
    if (!tentativa) continue;
    const { data, error } = await admin.auth.admin.createUser({ email: tentativa, password: senha, email_confirm: true, user_metadata: { nome }, app_metadata: { perfil } });
    if (!error) {
      email = tentativa;
      id = data.user.id;
      break;
    }
    if (!/already|registered|exists/i.test(error.message)) return falhar("Não foi possível criar o acesso. Tente de novo.");
  }
  if (!id) return falhar(USUARIO_EM_USO);

  // A linha em usuarios nasce pelo gatilho do login; aqui completa perfil e vínculo.
  const { error: erroPerfil } = await admin.from("usuarios").update({ nome, perfil, usuario, profissional_id: convite.profissional_id }).eq("id", id);
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(id);
    return falhar(erroPerfil.code === "23505" ? USUARIO_EM_USO : "Não foi possível criar o acesso. Tente de novo.");
  }

  await admin.from("convites").update({ usuario_id: id }).eq("id", convite.id);

  const supabase = await createClient();
  const { error: erroAoEntrar } = await supabase.auth.signInWithPassword({ email, password: senha });
  redirect(erroAoEntrar ? "/login" : "/agenda");
}

export async function redefinirSenha(token: string, _: EstadoDoCadastro, formData: FormData): Promise<EstadoDoCadastro> {
  const senha = String(formData.get("senha") ?? "");
  const erroSenha = erroDaSenha(senha, String(formData.get("confirmacao") ?? ""));
  if (erroSenha) return { erro: erroSenha, usuario: "" };

  const convite = await reservarConvite(token, "senha");
  if (!convite?.usuario_id || !convite.profissional.ativo) return { erro: LINK_INVALIDO, usuario: "" };

  const admin = createAdminClient();
  // O login precisa continuar ativo e vinculado a este profissional.
  const { data: login } = await admin.from("usuarios").select("email, ativo, profissional_id").eq("id", convite.usuario_id).maybeSingle();
  if (!login?.ativo || login.profissional_id !== convite.profissional_id) return { erro: LINK_INVALIDO, usuario: "" };

  const { error } = await admin.auth.admin.updateUserById(convite.usuario_id, { password: senha });
  if (error) {
    await admin.from("convites").update({ usado_em: null }).eq("id", convite.id);
    return { erro: /different|same/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha. Tente de novo.", usuario: "" };
  }

  const supabase = await createClient();
  const { error: erroAoEntrar } = await supabase.auth.signInWithPassword({ email: login.email, password: senha });
  // Quem estava com a senha antiga aberta em outro aparelho sai.
  if (!erroAoEntrar) await supabase.auth.signOut({ scope: "others" });
  redirect(erroAoEntrar ? "/login" : "/agenda");
}
