import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { PastaDeExportacao } from "./pasta-de-exportacao";
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
          {u.usuario && (
            <>
              <dt className="text-muted">Usuário</dt>
              <dd className="break-words">{u.usuario}</dd>
            </>
          )}
          <dt className="text-muted">E-mail</dt>
          <dd className="break-words">{u.email}</dd>
          <dt className="text-muted">Perfil</dt>
          <dd>{u.perfil === "adm" ? "Administrador" : u.perfil === "profissional" ? "Profissional" : "Limitado"}</dd>
          {profissional && (
            <>
              <dt className="text-muted">Profissional</dt>
              <dd>{profissional.nome}</dd>
            </>
          )}
        </dl>
        <p className="mt-3 text-xs text-muted">Para mudar nome ou perfil, fale com um administrador.</p>
      </section>
      {u.profissionalId && u.perfil !== "limitado" && (
        <section aria-label="Anamnese" className="flex items-center justify-between gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <div>
            <h2 className="font-semibold">Anamnese</h2>
            <p className="text-sm text-muted">As perguntas da sua anamnese.</p>
          </div>
          <Link href="/anamnese/editar?voltar=/conta" className="shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
            Editar anamnese
          </Link>
        </section>
      )}
      {u.profissionalId && u.perfil !== "limitado" && (
        <section aria-label="Atendimento" className="flex items-center justify-between gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <div>
            <h2 className="font-semibold">Atendimento</h2>
            <p className="text-sm text-muted">Os tópicos da sua tela de atendimento.</p>
          </div>
          <Link href="/atendimento/modelo?voltar=/conta" className="shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
            Editar tópicos
          </Link>
        </section>
      )}
      {u.profissionalId && u.perfil !== "limitado" && <PastaDeExportacao />}
      <TrocarSenha />
    </div>
  );
}
