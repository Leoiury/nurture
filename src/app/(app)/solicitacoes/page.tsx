import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ehProfissional } from "@/lib/auth/usuario";
import { carregarSolicitacoes, representantes } from "./dados";
import { ListaDeSolicitacoes } from "./lista-de-solicitacoes";

export const metadata: Metadata = { title: "Solicitações · Nurture" };

export default async function SolicitacoesPage() {
  // Quem decide: recepção e ADM. O profissional só pede (o banco também bloqueia).
  if (await ehProfissional()) redirect("/agenda");
  const solicitacoes = await carregarSolicitacoes();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Solicitações</h1>
        <p className="text-sm text-muted">Pedidos dos profissionais para excluir atendimentos e inativar pacientes.</p>
      </div>
      <ListaDeSolicitacoes solicitacoes={solicitacoes.map((s) => ({ ...s, alvos: representantes(s.atendimentos) }))} />
    </div>
  );
}
