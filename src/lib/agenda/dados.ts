import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { diasEspeciais, type DiaEspecial } from "./feriados";
import { inicioDoDiaISO, partesNoFuso, somarDias } from "./tempo";

export type Status = Database["public"]["Enums"]["status_atendimento"];

export type ProfissionalAgenda = {
  id: string;
  nome: string;
  especialidade: string | null;
};

export type AtendimentoAgenda = {
  id: string;
  /** Um ou mais profissionais: o card aparece na coluna de cada um. */
  profissionalIds: string[];
  profissionalNomes: string[];
  data: string; // AAAA-MM-DD no fuso da clínica
  inicio: number; // minutos desde 00:00
  fim: number;
  status: Status;
  paciente: string | null;
  plano: { nome: string; cor: string } | null;
  tipo: string | null;
};

/**
 * Logo após o login, o banco às vezes recusa o token recém-emitido como "emitido no
 * futuro" (PGRST303): os relógios do serviço de login e do banco diferem em ~1 s.
 * Uma única nova tentativa, um instante depois, resolve.
 */
async function comNovaTentativa<T extends { error: { code?: string } | null }>(consulta: () => PromiseLike<T>): Promise<T> {
  const resultado = await consulta();
  if (resultado.error?.code !== "PGRST303") return resultado;
  await new Promise((resolver) => setTimeout(resolver, 1000));
  return consulta();
}

/**
 * Feriados (nacionais + cadastrados) e recessos da clínica entre as datas, por dia.
 * Ausências por profissional (profissional_id preenchido) ficam para a próxima sprint.
 */
export async function carregarDiasEspeciais(primeiroDia: string, ultimoDia: string): Promise<Record<string, DiaEspecial[]>> {
  const supabase = await createClient();
  const { data, error } = await comNovaTentativa(() =>
    supabase
      .from("feriados")
      .select("nome, tipo, data_inicio, data_fim")
      .is("profissional_id", null)
      .lte("data_inicio", ultimoDia)
      .gte("data_fim", primeiroDia),
  );
  if (error) throw error;
  return Object.fromEntries(diasEspeciais(primeiroDia, ultimoDia, data));
}

/** Profissionais ativos, atendimentos e dias especiais entre as datas (inclusive). */
export async function carregarAgenda(primeiroDia: string, ultimoDia: string) {
  const supabase = await createClient();

  const [profissionais, atendimentos, especiais] = await Promise.all([
    comNovaTentativa(() => supabase.from("profissionais").select("id, nome, especialidade").eq("ativo", true).order("nome")),
    comNovaTentativa(() =>
      supabase
        .from("atendimentos")
        .select(
          "id, inicio, fim, status, profissionais:atendimento_profissionais(profissional:profissionais(id, nome)), paciente:pacientes(nome), plano:planos(nome, cor), tipo:tipos_atendimento(nome)",
        )
        .is("excluido_em", null)
        .gte("inicio", inicioDoDiaISO(primeiroDia))
        .lt("inicio", inicioDoDiaISO(somarDias(ultimoDia, 1)))
        .order("inicio"),
    ),
    carregarDiasEspeciais(primeiroDia, ultimoDia),
  ]);
  if (profissionais.error) throw profissionais.error;
  if (atendimentos.error) throw atendimentos.error;

  return {
    especiais,
    profissionais: profissionais.data satisfies ProfissionalAgenda[],
    atendimentos: atendimentos.data.map((a): AtendimentoAgenda => {
      const inicio = partesNoFuso(a.inicio);
      const fim = partesNoFuso(a.fim);
      return {
        id: a.id,
        profissionalIds: a.profissionais.map((p) => p.profissional.id),
        profissionalNomes: a.profissionais.map((p) => p.profissional.nome),
        data: inicio.data,
        inicio: inicio.minutos,
        // Atendimento que atravessa a meia-noite é cortado no fim do dia.
        fim: fim.data === inicio.data ? fim.minutos : 24 * 60,
        status: a.status,
        paciente: a.paciente?.nome ?? null,
        plano: a.plano,
        tipo: a.tipo?.nome ?? null,
      };
    }),
  };
}
