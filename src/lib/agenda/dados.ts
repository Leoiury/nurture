import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { escalaDasJornadas, escalaDoDia, type Escala, type Intervalo } from "./escala";
import { diasEspeciais, type DiaEspecial } from "./feriados";
import { ANTECEDENCIA_DIAS, aniversarios, comemoracoes, type Aniversario, type Comemoracao } from "./lembretes";
import { mapearPeriodo, type MapaDoPeriodo } from "./ocupacao";
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
  recorrenciaId: string | null;
  pacienteId: string | null;
  tipoId: string | null;
  /** Área do tipo (valor do plano por área; "segmento" nos ajustes em massa). */
  area: string | null;
  /** Veio da importação do sistema anterior (tem id_legado). */
  importado: boolean;
  /** O paciente faz aniversário no dia do atendimento (bolo no card). */
  aniversario?: boolean;
  /** Divergência com um atendimento do outro sistema (texto para o card). */
  divergencia?: string;
  /** Só no planejamento: como o atendimento difere da agenda real. */
  rascunho?: "novo" | "alterado" | "desmarcado";
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

const SELECAO_DA_AGENDA =
  "id, id_legado, paciente_id, tipo_id, inicio, fim, status, recorrencia_id, profissionais:atendimento_profissionais(profissional:profissionais(id, nome)), paciente:pacientes(nome), plano:planos(nome, cor), tipo:tipos_atendimento(nome, area)";

type LinhaDaAgenda = {
  id: string;
  inicio: string;
  fim: string;
  status: Status;
  recorrencia_id: string | null;
  id_legado: number | null;
  paciente_id: string | null;
  tipo_id: string | null;
  profissionais: { profissional: { id: string; nome: string } }[];
  paciente: { nome: string } | null;
  plano: { nome: string; cor: string } | null;
  tipo: { nome: string; area: string | null } | null;
};

function paraAgenda(a: LinhaDaAgenda): AtendimentoAgenda {
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
    recorrenciaId: a.recorrencia_id,
    pacienteId: a.paciente_id,
    tipoId: a.tipo_id,
    area: a.tipo?.area ?? null,
    importado: a.id_legado !== null,
  };
}

/** Profissionais ativos, atendimentos e dias especiais entre as datas (inclusive). */
export async function carregarAgenda(primeiroDia: string, ultimoDia: string) {
  const supabase = await createClient();

  const [profissionais, atendimentos, especiais] = await Promise.all([
    comNovaTentativa(() => supabase.from("profissionais").select("id, nome, especialidade").eq("ativo", true).order("nome")),
    comNovaTentativa(() =>
      supabase
        .from("atendimentos")
        .select(SELECAO_DA_AGENDA)
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
    atendimentos: atendimentos.data.map(paraAgenda),
  };
}

/**
 * Atendimentos citados por um planejamento que podem estar fora do período
 * exibido: os próprios e, para alterações em série, os demais da mesma série
 * (movidos de outra semana, eles podem cair na semana exibida).
 */
export async function carregarAtendimentosCitados(ids: string[]): Promise<AtendimentoAgenda[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const citados = await supabase.from("atendimentos").select("recorrencia_id").in("id", ids);
  if (citados.error) throw citados.error;
  const series = [...new Set(citados.data.map((c) => c.recorrencia_id).filter((r): r is string => !!r))];
  const filtro = series.length ? `id.in.(${ids.join(",")}),recorrencia_id.in.(${series.join(",")})` : `id.in.(${ids.join(",")})`;
  const { data, error } = await supabase.from("atendimentos").select(SELECAO_DA_AGENDA).is("excluido_em", null).or(filtro);
  if (error) throw error;
  return data.map(paraAgenda);
}

/** Escala de cada profissional (null: sem escala cadastrada, vale o expediente padrão). */
export async function carregarEscalas(profissionalIds: string[]): Promise<Map<string, Escala | null>> {
  const escalas = new Map<string, Escala | null>(profissionalIds.map((id) => [id, null]));
  if (profissionalIds.length === 0) return escalas;
  const supabase = await createClient();
  const { data, error } = await supabase.from("jornadas").select("profissional_id, dia_semana, hora_inicio, hora_fim").in("profissional_id", profissionalIds);
  if (error) throw error;
  for (const id of profissionalIds) escalas.set(id, escalaDasJornadas(data.filter((j) => j.profissional_id === id)));
  return escalas;
}

/**
 * Mapa de ocupação (escala, ocupado, livre, não otimizado) de cada profissional
 * entre as datas (inclusive), na agenda real.
 */
export async function carregarMapaDeOcupacao(profissionalIds: string[], primeiroDia: string, ultimoDia: string): Promise<Map<string, MapaDoPeriodo>> {
  const supabase = await createClient();
  const [escalas, especiais, atendimentos] = await Promise.all([
    carregarEscalas(profissionalIds),
    carregarDiasEspeciais(primeiroDia, ultimoDia),
    supabase
      .from("atendimentos")
      .select("inicio, fim, ap:atendimento_profissionais!inner(profissional_id)")
      .in("ap.profissional_id", profissionalIds)
      .is("excluido_em", null)
      .neq("status", "desmarcado")
      .gte("inicio", inicioDoDiaISO(primeiroDia))
      .lt("inicio", inicioDoDiaISO(somarDias(ultimoDia, 1))),
  ]);
  if (atendimentos.error) throw atendimentos.error;

  // Atendimentos por profissional e dia, em minutos.
  const porProfissionalEDia = new Map<string, Intervalo[]>();
  for (const a of atendimentos.data) {
    const ini = partesNoFuso(a.inicio);
    const fim = partesNoFuso(a.fim);
    const intervalo = { inicio: ini.minutos, fim: fim.data === ini.data ? fim.minutos : 24 * 60 };
    for (const { profissional_id } of a.ap) {
      const chave = `${profissional_id}|${ini.data}`;
      porProfissionalEDia.set(chave, [...(porProfissionalEDia.get(chave) ?? []), intervalo]);
    }
  }

  const dias: string[] = [];
  for (let d = primeiroDia; d <= ultimoDia; d = somarDias(d, 1)) dias.push(d);
  return new Map(
    profissionalIds.map((id) => [
      id,
      mapearPeriodo(
        dias,
        (d) => escalaDoDia(escalas.get(id) ?? null, d, especiais[d]),
        (d) => porProfissionalEDia.get(`${id}|${d}`) ?? [],
      ),
    ]),
  );
}

export type Lembretes = {
  /** De hoje até ANTECEDENCIA_DIAS à frente (aviso na barra da agenda). */
  proximos: { aniversarios: Aniversario[]; comemoracoes: Comemoracao[] };
  /** Nos dias exibidos (bolo nos cards, estrela no cabeçalho do dia). */
  exibidos: { aniversarios: Aniversario[]; comemoracoes: Comemoracao[] };
};

/** Aniversários (pacientes ativos) e datas comemorativas para a agenda. */
export async function carregarLembretes(hoje: string, primeiroDia: string, ultimoDia: string): Promise<Lembretes> {
  const supabase = await createClient();
  const [pacientes, datas] = await Promise.all([
    supabase.from("pacientes").select("id, nome, data_nascimento").eq("ativo", true).not("data_nascimento", "is", null),
    supabase.from("datas_comemorativas").select("id, nome, descricao, mes, dia, ordem, dia_semana, pascoa"),
  ]);
  if (pacientes.error) throw pacientes.error;
  if (datas.error) throw datas.error;
  const lista = pacientes.data.map((p) => ({ id: p.id, nome: p.nome, nascimento: p.data_nascimento }));
  const ate = somarDias(hoje, ANTECEDENCIA_DIAS - 1);
  return {
    proximos: { aniversarios: aniversarios(lista, hoje, ate), comemoracoes: comemoracoes(datas.data, hoje, ate) },
    exibidos: { aniversarios: aniversarios(lista, primeiroDia, ultimoDia), comemoracoes: comemoracoes(datas.data, primeiroDia, ultimoDia) },
  };
}
