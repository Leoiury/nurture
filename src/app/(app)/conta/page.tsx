import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { TrocarSenha } from "./trocar-senha";

export const metadata: Metadata = { title: "Minha conta · Nurture" };

export default async function ContaPage() {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  const supabase = await createClient();
  const profissional = u.profissionalId ? (await supabase.from("profissionais").select("nome").eq("id", u.profissionalId).maybeSingle()).data : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
      <section aria-label="Dados da conta" className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Nome</dt>
          <dd>{u.nome}</dd>
          <dt className="text-muted">E-mail</dt>
          <dd className="break-words">{u.email}</dd>
          <dt className="text-muted">Perfil</dt>
          <dd>{u.perfil === "adm" ? "Administrador" : "Limitado"}</dd>
          {profissional && (
            <>
              <dt className="text-muted">Profissional</dt>
              <dd>{profissional.nome}</dd>
            </>
          )}
        </dl>
        <p className="mt-3 text-xs text-muted">Para mudar nome ou perfil, fale com um administrador.</p>
      </section>
      <TrocarSenha />
    </div>
  );
}
