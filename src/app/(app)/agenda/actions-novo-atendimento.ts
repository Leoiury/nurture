"use server";

// Ações do painel "Novo atendimento".

import { revalidatePath } from "next/cache";
import { MAXIMO_DE_SESSOES, datasDaSerie, type FimDaSerie, type Frequencia } from "@/lib/agenda/recorrencia";
import { FUSO, instanteNoFuso } from "@/lib/agenda/tempo";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Status = Database["public"]["Enums"]["status_atendimento"];

/** Listas do formulário: pacientes, profissionais, planos e tipos (só ativos). */
export async function opcoesDoFormulario() {
  const supabase = await createClient();
  const [pacientes, profissionais, planos, tipos] = await Promise.all([
    supabase.from("pacientes").select("id, nome, responsavel, plano_id").eq("ativo", true).order("nome"),
    supabase.from("profissionais").select("id, nome, especialidade").eq("ativo", true).order("nome"),
    supabase.from("planos").select("id, nome, cor, duracao_padrao_min, valor_padrao").eq("ativo", true).order("nome"),
    supabase.from("tipos_atendimento").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  for (const r of [pacientes, profissionais, planos, tipos]) if (r.error) throw new Error("Não foi possível carregar o formulário.");
  return { pacientes: pacientes.data!, profissionais: profissionais.data!, planos: planos.data!, tipos: tipos.data! };
}

export type OpcoesDoFormulario = Awaited<ReturnType<typeof opcoesDoFormulario>>;

export type Serie = { frequencia: Frequencia; fim: FimDaSerie } | null;

type Agendamento = {
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  duracaoMin: number;
  serie: Serie;
};

/** Instantes de início de cada atendimento (um só, ou a série inteira). */
function inicios({ data, hora, serie }: Agendamento): string[] {
  const datas = serie ? datasDaSerie(data, serie.frequencia, serie.fim) : [data];
  return datas.map((d) => instanteNoFuso(d, hora));
}

export type Conflito = { inicio: string; tipo: "profissional" | "paciente"; descricao: string };

const formatoConflito = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Atendimentos já existentes que se sobrepõem aos novos, com o mesmo profissional
 * (paralelo) ou o mesmo paciente (com outro profissional). Só avisa; não bloqueia.
 */
export async function verificarConflitos(
  agendamento: Agendamento & {
    profissionais: string[];
    pacienteId: string | null;
    /** Na edição: o próprio atendimento (e a série, se o alcance for além dele) não conta como conflito. */
    ignorar?: { id: string; recorrenciaId: string | null };
  },
): Promise<Conflito[]> {
  const lista = inicios(agendamento);
  if (lista.length === 0 || (agendamento.profissionais.length === 0 && !agendamento.pacienteId)) return [];

  const duracaoMs = agendamento.duracaoMin * 60_000;
  const janelas = lista.map((i) => ({ inicio: new Date(i).getTime(), fim: new Date(i).getTime() + duracaoMs }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atendimentos")
    .select("id, recorrencia_id, inicio, fim, paciente_id, paciente:pacientes(nome), profissionais:atendimento_profissionais(profissional:profissionais(id, nome))")
    .is("excluido_em", null)
    .neq("status", "desmarcado")
    .lt("inicio", new Date(Math.max(...janelas.map((j) => j.fim))).toISOString())
    .gt("fim", new Date(Math.min(...janelas.map((j) => j.inicio))).toISOString());
  if (error) throw new Error("Não foi possível verificar conflitos.");

  const conflitos: Conflito[] = [];
  const { ignorar } = agendamento;
  for (const existente of data) {
    if (ignorar && (existente.id === ignorar.id || (ignorar.recorrenciaId && existente.recorrencia_id === ignorar.recorrenciaId))) continue;
    const ini = new Date(existente.inicio).getTime();
    const fim = new Date(existente.fim).getTime();
    const janela = janelas.find((j) => j.inicio < fim && j.fim > ini);
    if (!janela) continue;
    const quando = formatoConflito.format(new Date(existente.inicio));
    for (const { profissional } of existente.profissionais) {
      if (agendamento.profissionais.includes(profissional.id)) {
        conflitos.push({
          inicio: existente.inicio,
          tipo: "profissional",
          descricao: `${profissional.nome} já atende ${existente.paciente?.nome ?? "outro atendimento"} (${quando})`,
        });
      }
    }
    if (agendamento.pacienteId && existente.paciente_id === agendamento.pacienteId) {
      const outros = existente.profissionais.map((p) => p.profissional.nome).join(", ");
      conflitos.push({ inicio: existente.inicio, tipo: "paciente", descricao: `Paciente já tem atendimento com ${outros} (${quando})` });
    }
  }
  return conflitos.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export type NovoAtendimento = Agendamento & {
  pacienteId: string;
  profissionais: string[];
  planoId: string | null;
  tipoId: string | null;
  valor: number | null;
  status: Status;
  observacao: string;
};

export type ResultadoCriacao = { ok: true; quantidade: number } | { ok: false; erro: string };

export async function criarAtendimentos(novo: NovoAtendimento): Promise<ResultadoCriacao> {
  if (!novo.pacienteId) return { ok: false, erro: "Escolha o paciente." };
  if (novo.profissionais.length === 0) return { ok: false, erro: "Escolha ao menos um profissional." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novo.data) || !/^\d{2}:\d{2}$/.test(novo.hora)) return { ok: false, erro: "Informe data e horário." };
  if (!(novo.duracaoMin > 0 && novo.duracaoMin <= 12 * 60)) return { ok: false, erro: "Duração inválida." };
  if (novo.valor !== null && !(novo.valor >= 0)) return { ok: false, erro: "Valor inválido." };

  let lista: string[];
  try {
    lista = inicios(novo);
  } catch {
    return { ok: false, erro: "Data inválida." }; // ex.: 31/02 não converte
  }
  if (lista.length === 0) return { ok: false, erro: "A repetição não gera nenhuma data: confira a data final." };
  if (lista.length > MAXIMO_DE_SESSOES) return { ok: false, erro: `Uma série pode ter no máximo ${MAXIMO_DE_SESSOES} atendimentos.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_atendimentos", {
    p_paciente_id: novo.pacienteId,
    p_profissionais: novo.profissionais,
    p_plano_id: novo.planoId ?? undefined,
    p_tipo_id: novo.tipoId ?? undefined,
    p_valor: novo.valor ?? undefined,
    p_status: novo.status,
    p_inicios: lista,
    p_duracao_min: novo.duracaoMin,
    p_observacao: novo.observacao || undefined,
    p_frequencia: novo.serie?.frequencia,
    p_data_fim: novo.serie?.fim.tipo === "data" ? novo.serie.fim.ate : undefined,
    p_sessoes: novo.serie?.fim.tipo === "sessoes" ? novo.serie.fim.quantidade : undefined,
  });
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/agenda");
  return { ok: true, quantidade: data.length };
}

export type NovoPaciente = { nome: string; responsavel: string; celular: string; planoId: string | null };

/** Cadastro rápido, feito de dentro do painel de novo atendimento. */
export async function criarPaciente(novo: NovoPaciente) {
  const nome = novo.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 3) return { ok: false as const, erro: "Informe o nome do paciente." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pacientes")
    .insert({ nome, responsavel: novo.responsavel.trim() || null, celular: novo.celular.trim() || null, plano_id: novo.planoId })
    .select("id, nome, responsavel, plano_id")
    .single();
  if (error) return { ok: false as const, erro: "Não foi possível cadastrar o paciente." };
  return { ok: true as const, paciente: data };
}
