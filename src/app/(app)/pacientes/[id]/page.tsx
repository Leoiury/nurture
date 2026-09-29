import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FichaDoPaciente } from "./ficha-do-paciente";
import { HistoricoDoPaciente, type AtendimentoDoHistorico } from "./historico-do-paciente";

export const metadata: Metadata = { title: "Paciente · Nurture" };

export default async function PacientePage({ params }: PageProps<"/pacientes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [paciente, atendimentos, planos] = await Promise.all([
    supabase
      .from("pacientes")
      .select(
        "id, nome, responsavel, data_nascimento, cpf, celular, email, endereco, bairro, cidade, uf, cep, plano_id, ativo, nivel_cadastral, pendencias_cadastrais, plano:planos(nome, cor)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("atendimentos")
      .select(
        `id, inicio, fim, status, motivo_desmarcacao, recorrencia_id,
         profissionais:atendimento_profissionais(profissional:profissionais(nome)),
         tipo:tipos_atendimento(nome),
         plano:planos(nome, cor),
         observacoes:atendimentos_observacoes(count)`,
      )
      .eq("paciente_id", id)
      .is("excluido_em", null)
      .order("inicio", { ascending: false })
      .limit(1000),
    supabase.from("planos").select("id, nome, ativo").order("nome"),
  ]);
  if (paciente.error || atendimentos.error || planos.error) throw new Error("Não foi possível carregar o paciente.");
  if (!paciente.data) notFound();

  const historico: AtendimentoDoHistorico[] = atendimentos.data.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    fim: a.fim,
    status: a.status,
    motivoDesmarcacao: a.motivo_desmarcacao,
    emSerie: !!a.recorrencia_id,
    profissionais: a.profissionais.map((p) => p.profissional.nome),
    tipo: a.tipo?.nome ?? null,
    plano: a.plano,
    observacoes: a.observacoes[0]?.count ?? 0,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/pacientes" className="text-sm text-muted hover:text-foreground">
        ← Pacientes
      </Link>
      <FichaDoPaciente paciente={paciente.data} planos={planos.data} />
      <HistoricoDoPaciente atendimentos={historico} />
    </div>
  );
}
