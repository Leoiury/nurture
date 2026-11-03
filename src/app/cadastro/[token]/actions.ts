"use server";

// Criação do login pelo link do convite: quem entra aqui ainda não tem sessão, e o
// que autoriza é o próprio link.

import { redirect } from "next/navigation";
import { reservarConvite } from "@/lib/auth/convite";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoDoCadastro = { erro: string; email: string } | undefined;

const LINK_INVALIDO = "Este link não vale mais. Peça um novo à clínica.";

export async function concluirCadastro(token: string, _: EstadoDoCadastro, formData: FormData): Promise<EstadoDoCadastro> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Confira o e-mail.", email };
  if (senha.length < 8) return { erro: "A senha precisa ter ao menos 8 caracteres.", email };
  if (senha !== confirmacao) return { erro: "As duas senhas não são iguais.", email };

  const convite = await reservarConvite(token);
  if (!convite || !convite.profissional.ativo) return { erro: LINK_INVALIDO, email };

  const admin = createAdminClient();
  // Qualquer falha daqui em diante devolve o link, para a pessoa tentar de novo.
  const falhar = async (erro: string): Promise<EstadoDoCadastro> => {
    await admin.from("convites").update({ usado_em: null }).eq("id", convite.id);
    return { erro, email };
  };

  const { count } = await admin.from("usuarios").select("id", { count: "exact", head: true }).eq("profissional_id", convite.profissional_id).eq("ativo", true);
  if (count) return falhar("Este profissional já tem um login. Fale com a clínica.");

  const { nome } = convite.profissional;
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome }, app_metadata: { perfil: "profissional" } });
  if (error) return falhar(/already|registered|exists/i.test(error.message) ? "Já existe um login com esse e-mail. Use outro, ou fale com a clínica." : "Não foi possível criar o acesso. Tente de novo.");

  // A linha em usuarios nasce pelo gatilho do login; aqui completa perfil e vínculo.
  const { error: erroPerfil } = await admin.from("usuarios").update({ nome, perfil: "profissional", profissional_id: convite.profissional_id }).eq("id", data.user.id);
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(data.user.id);
    return falhar("Não foi possível criar o acesso. Tente de novo.");
  }

  await admin.from("convites").update({ usuario_id: data.user.id }).eq("id", convite.id);
  // O cadastro do profissional ainda não tinha e-mail: aproveita o que ele informou.
  await admin.from("profissionais").update({ email }).eq("id", convite.profissional_id).is("email", null);

  const supabase = await createClient();
  const { error: erroAoEntrar } = await supabase.auth.signInWithPassword({ email, password: senha });
  redirect(erroAoEntrar ? "/login" : "/agenda");
}
