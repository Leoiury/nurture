import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ATENDIMENTOS_SEM_VALOR } from "@/lib/agenda/sem-valor";
import { FUSO } from "@/lib/agenda/tempo";
import { ehProfissional, podeVerClinico, usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { FichaDoPaciente } from "./ficha-do-paciente";
import { HistoricoDoPaciente, type AtendimentoDoHistorico } from "./historico-do-paciente";

export const metadata: Metadata = { title: "Paciente · Nurture" };

const dataDaAnamnese = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

const FICHA =
  "id, nome, responsavel, data_nascimento, cpf, celular, email, endereco, bairro, cidade, uf, cep, plano_id, ativo, nivel_cadastral, pendencias_cadastrais, plano:planos(nome, cor)";
// A mesma ficha para o perfil profissional, sem acesso à tabela de planos.
const FICHA_SEM_VALOR =
  "id, nome, responsavel, data_nascimento, cpf, celular, email, endereco, bairro, cidade, uf, cep, plano_id, ativo, nivel_cadastral, pendencias_cadastrais, plano:planos_equipe(nome, cor)" as typeof FICHA;

const HISTORICO = `id, inicio, fim, status, motivo_desmarcacao, recorrencia_id,
         profissionais:atendimento_profissionais(profissional:profissionais(nome)),
         tipo:tipos_atendimento(nome),
         plano:planos(nome, cor),
         observacoes:atendimentos_observacoes(count)`;
const HISTORICO_SEM_VALOR = `id, inicio, fim, status, motivo_desmarcacao, recorrencia_id,
         profissionais:atendimento_profissionais(profissional:profissionais(nome)),
         tipo:tipos_atendimento(nome),
         plano:planos_equipe(nome, cor),
         observacoes:atendimentos_observacoes(count)` as typeof HISTORICO;

export default async function PacientePage({ params }: PageProps<"/pacientes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const semValores = await ehProfissional();
  // Conteúdo clínico: a recepção não vê nem a lista (o banco também bloqueia).
  const [clinico, eu] = await Promise.all([podeVerClinico(), usuarioAtual()]);
  const anamneses = clinico
    ? await supabase
        .from("anamneses")
        .select("id, versao, salva_em, criado_em, profissional:profissionais(nome)")
        .eq("paciente_id", id)
        .order("criado_em", { ascending: false })
    : null;
  if (anamneses?.error) throw new Error("Não foi possível carregar as anamneses.");

  const [paciente, atendimentos, planos] = await Promise.all([
    supabase
      .from("pacientes")
      .select(semValores ? FICHA_SEM_VALOR : FICHA)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from(semValores ? ATENDIMENTOS_SEM_VALOR : "atendimentos")
      .select(semValores ? HISTORICO_SEM_VALOR : HISTORICO)
      .eq("paciente_id", id)
      .is("excluido_em", null)
      .order("inicio", { ascending: false })
      .limit(1000),
    supabase.from((semValores ? "planos_equipe" : "planos") as "planos").select("id, nome, ativo").order("nome"),
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
      {anamneses && (
        <section aria-label="Anamneses" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Anamneses</h2>
            {eu?.profissionalId && (
              <Link href={`/anamnese?paciente=${id}`} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
                Nova anamnese
              </Link>
            )}
          </div>
          {anamneses.data.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma anamnese.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {anamneses.data.map((a) => (
                <li key={a.id}>
                  <Link href={`/anamnese/${a.id}`} className="flex flex-wrap justify-between gap-x-3 rounded-lg px-2 py-1.5 hover:bg-background">
                    <span className="font-medium">{a.profissional.nome}</span>
                    <span className="text-muted">
                      {a.salva_em ? dataDaAnamnese.format(new Date(a.salva_em)) : "Em andamento"}
                      {a.versao > 1 && ` · versão ${a.versao}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <HistoricoDoPaciente atendimentos={historico} />
    </div>
  );
}
