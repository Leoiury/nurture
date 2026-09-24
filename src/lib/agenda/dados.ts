import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { inicioDoDiaISO, partesNoFuso, somarDias } from "./tempo";

export type Status = Database["public"]["Enums"]["status_atendimento"];

export type ProfissionalAgenda = {
  id: string;
  nome: string;
  especialidade: string | null;
};

export type AtendimentoAgenda = {
  id: string;
  profissionalId: string;
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

/** Profissionais ativos e atendimentos entre as datas (inclusive). */
export async function carregarAgenda(primeiroDia: string, ultimoDia: string) {
  const supabase = await createClient();

  const [profissionais, atendimentos] = await Promise.all([
    comNovaTentativa(() => supabase.from("profissionais").select("id, nome, especialidade").eq("ativo", true).order("nome")),
    comNovaTentativa(() =>
      supabase
        .from("atendimentos")
        .select("id, inicio, fim, status, profissional_id, paciente:pacientes(nome), plano:planos(nome, cor), tipo:tipos_atendimento(nome)")
        .gte("inicio", inicioDoDiaISO(primeiroDia))
        .lt("inicio", inicioDoDiaISO(somarDias(ultimoDia, 1)))
        .order("inicio"),
    ),
  ]);
  if (profissionais.error) throw profissionais.error;
  if (atendimentos.error) throw atendimentos.error;

  return {
    profissionais: profissionais.data satisfies ProfissionalAgenda[],
    atendimentos: atendimentos.data.map((a): AtendimentoAgenda => {
      const inicio = partesNoFuso(a.inicio);
      const fim = partesNoFuso(a.fim);
      return {
        id: a.id,
        profissionalId: a.profissional_id,
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
