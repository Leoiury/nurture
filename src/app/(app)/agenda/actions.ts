"use server";

// Ações do painel de um atendimento: detalhes, status, desmarcar, excluir,
// observações e edição.

import { revalidatePath } from "next/cache";
import { instanteNoFuso } from "@/lib/agenda/tempo";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Status = Database["public"]["Enums"]["status_atendimento"];
export type Alcance = Database["public"]["Enums"]["alcance_serie"];
export type Resultado = { ok: true; quantidade?: number } | { ok: false; erro: string };

/** Detalhes para o painel lateral, com a série (se houver) e as observações. */
export async function detalhesAtendimento(id: string) {
  const supabase = await createClient();

  const { data: atendimento, error } = await supabase
    .from("atendimentos")
    .select(
      `id, inicio, fim, status, valor, observacao, motivo_desmarcacao, recorrencia_id, paciente_id, plano_id, tipo_id,
       profissionais:atendimento_profissionais(profissional:profissionais(id, nome, especialidade)),
       plano:planos(nome, cor),
       tipo:tipos_atendimento(nome),
       recorrencia:recorrencias(frequencia),
       paciente:pacientes(id, nome, responsavel, data_nascimento, celular, email, plano:planos(nome))`,
    )
    .eq("id", id)
    .is("excluido_em", null)
    .single();
  if (error) throw new Error("Atendimento não encontrado.");

  const [serie, observacoes] = await Promise.all([
    atendimento.recorrencia_id
      ? supabase.from("atendimentos").select("inicio").eq("recorrencia_id", atendimento.recorrencia_id).is("excluido_em", null)
      : null,
    supabase.from("atendimentos_observacoes").select("id, criado_em, texto, automatica").eq("atendimento_id", id).order("criado_em", { ascending: false }),
  ]);
  if (serie?.error || observacoes.error) throw new Error("Não foi possível carregar o atendimento.");

  return {
    atendimento,
    // Tamanho da série e quantos vêm a partir deste (inclusive), para as opções de alcance.
    serie: serie ? { total: serie.data.length, seguintes: serie.data.filter((s) => s.inicio >= atendimento.inicio).length } : null,
    observacoes: observacoes.data,
  };
}

export type DetalhesAtendimento = Awaited<ReturnType<typeof detalhesAtendimento>>;

function concluir(error: { message: string } | null, quantidade?: number): Resultado {
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/agenda");
  return { ok: true, quantidade };
}

/** Status rápido (confirmado, atendido, faltou, ou de volta a marcado). Desmarcar tem ação própria. */
export async function alterarStatus(id: string, status: Exclude<Status, "desmarcado">): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("atendimentos").update({ status, motivo_desmarcacao: null }).eq("id", id);
  return concluir(error);
}

export async function desmarcar(id: string, alcance: Alcance, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "Informe o motivo." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("desmarcar_atendimentos", { p_id: id, p_alcance: alcance, p_motivo: motivo.trim() });
  return concluir(error, data ?? 0);
}

export async function excluir(id: string, alcance: Alcance, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "A exclusão exige uma observação." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("excluir_atendimentos", { p_id: id, p_alcance: alcance, p_motivo: motivo.trim() });
  return concluir(error, data ?? 0);
}

export async function adicionarObservacao(id: string, texto: string): Promise<Resultado> {
  if (!texto.trim()) return { ok: false, erro: "Escreva a observação." };
  const supabase = await createClient();
  const { error } = await supabase.from("atendimentos_observacoes").insert({ atendimento_id: id, texto: texto.trim() });
  return concluir(error);
}

export type Edicao = {
  id: string;
  alcance: Alcance;
  pacienteId: string;
  profissionais: string[];
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  duracaoMin: number;
  planoId: string | null;
  tipoId: string | null;
  valor: number | null;
};

export async function editar(e: Edicao): Promise<Resultado> {
  if (!e.pacienteId) return { ok: false, erro: "Escolha o paciente." };
  if (e.profissionais.length === 0) return { ok: false, erro: "Escolha ao menos um profissional." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data) || !/^\d{2}:\d{2}$/.test(e.hora)) return { ok: false, erro: "Informe data e horário." };
  if (!(e.duracaoMin > 0 && e.duracaoMin <= 12 * 60)) return { ok: false, erro: "Duração inválida." };
  if (e.valor !== null && !(e.valor >= 0)) return { ok: false, erro: "Valor inválido." };
  // Valida a combinação data + hora antes de enviar (ex.: 31/02 lança erro ao converter).
  try {
    instanteNoFuso(e.data, e.hora);
  } catch {
    return { ok: false, erro: "Data inválida." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("editar_atendimentos", {
    p_id: e.id,
    p_alcance: e.alcance,
    p_paciente_id: e.pacienteId,
    p_profissionais: e.profissionais,
    p_data: e.data,
    p_hora: e.hora,
    p_duracao_min: e.duracaoMin,
    p_plano_id: e.planoId ?? undefined,
    p_tipo_id: e.tipoId ?? undefined,
    p_valor: e.valor ?? undefined,
  });
  return concluir(error, data ?? 0);
}

export type Movimento = {
  id: string;
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  /** Coluna de onde o card saiu e para onde foi (iguais: só muda o horário). */
  deProfissional: string;
  paraProfissional: string;
};

/** Arrastar o card: novo horário (mesma duração) e, se mudou de coluna, troca o profissional. */
export async function mover(m: Movimento): Promise<Resultado> {
  let inicio: string;
  try {
    inicio = instanteNoFuso(m.data, m.hora);
  } catch {
    return { ok: false, erro: "Horário inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mover_atendimento", {
    p_id: m.id,
    p_inicio: inicio,
    p_de_profissional: m.deProfissional,
    p_para_profissional: m.paraProfissional,
  });
  return concluir(error);
}
