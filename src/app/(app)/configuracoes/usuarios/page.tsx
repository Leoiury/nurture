import type { Metadata } from "next";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ListaDeUsuarios, type UsuarioDaLista } from "./lista-de-usuarios";

export const metadata: Metadata = { title: "Usuários · Nurture" };

export default async function UsuariosPage() {
  const supabase = await createClient();
  const [usuarios, profissionais, eu] = await Promise.all([
    supabase.from("usuarios").select("id, nome, email, perfil, ativo, profissional_id").order("ativo", { ascending: false }).order("nome"),
    supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome"),
    usuarioAtual(),
  ]);
  if (usuarios.error || profissionais.error) throw new Error("Não foi possível carregar os usuários.");

  // Último acesso vem do login (Supabase Auth).
  const ultimoAcesso = new Map<string, string | null>();
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data.users) ultimoAcesso.set(u.id, u.last_sign_in_at ?? null);
  } catch {
    // Sem a secret key no servidor: a lista funciona, sem o último acesso.
  }

  const lista: UsuarioDaLista[] = usuarios.data.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    ativo: u.ativo,
    profissionalId: u.profissional_id,
    ultimoAcesso: ultimoAcesso.get(u.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        <strong className="font-medium text-foreground">Administrador</strong>: acesso a tudo, inclusive configurações, planejamento, importação e
        usuários. <strong className="font-medium text-foreground">Limitado</strong>: agenda e pacientes; vê profissionais, sem alterar cadastros.
      </p>
      <ListaDeUsuarios usuarios={lista} profissionais={profissionais.data} euId={eu?.id ?? ""} />
    </div>
  );
}
