"use server";

// Ações do painel de um atendimento: detalhes, status, desmarcar, excluir,
// observações e edição.

import { revalidatePath } from "next/cache";
import type { ArgsEditar } from "@/lib/agenda/planejamento";
import { instanteNoFuso } from "@/lib/agenda/tempo";
import { ATENDIMENTOS_SEM_VALOR } from "@/lib/agenda/sem-valor";
import { ehAdm, ehProfissional, podeVerClinico, usuarioAtual } from "@/lib/auth/usuario";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Status = Database["public"]["Enums"]["status_atendimento"];
export type Alcance = Database["public"]["Enums"]["alcance_serie"];
export type Resultado = { ok: true; quantidade?: number } | { ok: false; erro: string };

const DETALHES = `id, inicio, fim, status, valor, observacao, motivo_desmarcacao, recorrencia_id, paciente_id, plano_id, tipo_id, exclusao_solicitada_em, exclusao_motivo,
       profissionais:atendimento_profissionais(profissional:profissionais(id, nome, especialidade)),
       plano:planos(nome, cor),
       tipo:tipos_atendimento(nome, abre_anamnese),
       recorrencia:recorrencias(frequencia),
       paciente:pacientes(id, nome, responsavel, data_nascimento, celular, email, plano:planos(nome))`;

// Os mesmos detalhes sem valores, para o perfil profissional.
const DETALHES_SEM_VALOR = `id, inicio, fim, status, observacao, motivo_desmarcacao, recorrencia_id, paciente_id, plano_id, tipo_id, exclusao_solicitada_em, exclusao_motivo,
       profissionais:atendimento_profissionais(profissional:profissionais(id, nome, especialidade)),
       plano:planos_equipe(nome, cor),
       tipo:tipos_atendimento(nome, abre_anamnese),
       recorrencia:recorrencias(frequencia),
       paciente:pacientes(id, nome, responsavel, data_nascimento, celular, email, plano:planos_equipe(nome))` as typeof DETALHES;

/** Detalhes para o painel lateral, com a série (se houver) e as observações. */
export async function detalhesAtendimento(id: string) {
  const supabase = await createClient();
  const semValores = await ehProfissional();

  const { data: atendimento, error } = await supabase
    .from(semValores ? ATENDIMENTOS_SEM_VALOR : "atendimentos")
    .select(semValores ? DETALHES_SEM_VALOR : DETALHES)
    .eq("id", id)
    .is("excluido_em", null)
    .single();
  if (error) throw new Error("Atendimento não encontrado.");

  const eu = await usuarioAtual();
  const [serie, observacoes, adm] = await Promise.all([
    atendimento.recorrencia_id
      ? supabase.from(ATENDIMENTOS_SEM_VALOR).select("inicio").eq("recorrencia_id", atendimento.recorrencia_id).is("excluido_em", null)
      : null,
    supabase.from("atendimentos_observacoes").select("id, criado_em, texto, automatica").eq("atendimento_id", id).order("criado_em", { ascending: false }),
    ehAdm(),
  ]);
  if (serie?.error || observacoes.error) throw new Error("Não foi possível carregar o atendimento.");

  // Registro do atendimento (recepção não vê): quem atende realiza; os demais, se houver, leem.
  let registro: { atende: boolean; iniciado: boolean } | null = null;
  // Tipo Anamnese: no lugar do registro, abre a anamnese ligada a este atendimento.
  let anamnese: { atende: boolean; id: string | null; salva: boolean; nome: string } | null = null;
  if (await podeVerClinico()) {
    const atende = !!eu?.profissionalId && atendimento.profissionais.some((x) => x.profissional.id === eu.profissionalId);
    const { data: registros } = await supabase.from("registros_atendimento").select("profissional_id").eq("atendimento_id", id);
    registro = { atende, iniciado: !!registros?.some((r) => !atende || r.profissional_id === eu?.profissionalId) };
    if (atendimento.tipo?.abre_anamnese) {
      const { data: ligadas } = await supabase.from("anamneses").select("id, salva_em, profissional_id").eq("atendimento_id", id);
      // Quem atende abre a própria; os demais, uma já salva.
      const ligada = ligadas?.find((l) => (atende ? l.profissional_id === eu?.profissionalId : !!l.salva_em));
      anamnese = { atende, id: ligada?.id ?? null, salva: !!ligada?.salva_em, nome: (atendimento.tipo.nome ?? "anamnese").toLowerCase() };
    }
  }

  // Quantos atendimentos entram no pedido de exclusão (a série pedida de uma vez).
  let pedido = 0;
  if (atendimento.exclusao_solicitada_em) {
    pedido = 1;
    if (atendimento.recorrencia_id) {
      const { count } = await supabase
        .from(ATENDIMENTOS_SEM_VALOR)
        .select("id", { count: "exact", head: true })
        .eq("recorrencia_id", atendimento.recorrencia_id)
        .eq("exclusao_solicitada_em", atendimento.exclusao_solicitada_em)
        .is("excluido_em", null);
      pedido = count ?? 1;
    }
  }

  return {
    atendimento,
    semValores,
    // O profissional vê os atendimentos de todos os pacientes, mas só altera os dele.
    podeAlterar: !semValores || atendimento.profissionais.some((x) => x.profissional.id === eu?.profissionalId),
    // Tamanho da série e quantos vêm a partir deste (inclusive), para as opções de alcance.
    serie: serie ? { total: serie.data.length, seguintes: serie.data.filter((s) => s.inicio >= atendimento.inicio).length } : null,
    observacoes: observacoes.data,
    pedido,
    registro,
    anamnese,
    // Só a direção vê o financeiro.
    financeiro: adm ? await financeiroDoAtendimento(id) : null,
  };
}

/** Quanto já foi pago e baixado (glosa, desconto) do atendimento. */
async function financeiroDoAtendimento(id: string): Promise<{ recebido: number; baixado: number }> {
  const supabase = await createClient();
  const [quitacoes, baixas] = await Promise.all([
    supabase.from("pagamentos_atendimentos").select("valor").eq("atendimento_id", id),
    supabase.from("baixas_atendimentos").select("valor").eq("atendimento_id", id),
  ]);
  const soma = (linhas: { valor: number }[] | null) => (linhas ?? []).reduce((t, l) => t + Number(l.valor), 0);
  return { recebido: soma(quitacoes.data), baixado: soma(baixas.data) };
}

export type DetalhesAtendimento = Awaited<ReturnType<typeof detalhesAtendimento>>;

function concluir(error: { message: string } | null, quantidade?: number): Resultado {
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/agenda");
  revalidatePath("/pacientes", "layout"); // histórico na página do paciente
  return { ok: true, quantidade };
}

/** Status rápido (confirmado, atendido, faltou, ou de volta a marcado). Desmarcar tem ação própria. */
export async function alterarStatus(id: string, status: Exclude<Status, "desmarcado">): Promise<Resultado> {
  const supabase = await createClient();
  if (await ehProfissional()) {
    const { error } = await supabase.rpc("profissional_alterar_status", { p_id: id, p_status: status });
    return concluir(error);
  }
  // Sem permissão, o RLS não dá erro: simplesmente nenhuma linha muda.
  const { data, error } = await supabase.from("atendimentos").update({ status, motivo_desmarcacao: null }).eq("id", id).select("id");
  if (!error && data.length === 0) return { ok: false, erro: "Não foi possível alterar este atendimento." };
  return concluir(error);
}

export async function desmarcar(id: string, alcance: Alcance, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "Informe o motivo." };
  const supabase = await createClient();
  const funcao = (await ehProfissional()) ? "profissional_desmarcar_atendimentos" : "desmarcar_atendimentos";
  const { data, error } = await supabase.rpc(funcao, { p_id: id, p_alcance: alcance, p_motivo: motivo.trim() });
  return concluir(error, data ?? 0);
}

export async function excluir(id: string, alcance: Alcance, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "A exclusão exige uma observação." };
  const supabase = await createClient();
  // O profissional só pede: a recepção ou um ADM confirma.
  const funcao = (await ehProfissional()) ? "profissional_solicitar_exclusao" : "excluir_atendimentos";
  const { data, error } = await supabase.rpc(funcao, { p_id: id, p_alcance: alcance, p_motivo: motivo.trim() });
  return concluir(error, data ?? 0);
}

/** Confirma o pedido de exclusão de um profissional (este atendimento e os da série no mesmo pedido). */
export async function confirmarExclusao(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirmar_exclusao", { p_id: id });
  if (!error && !data) return { ok: false, erro: "Não foi possível confirmar a exclusão." };
  return concluir(error, data ?? 0);
}

export async function recusarExclusao(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recusar_exclusao", { p_id: id });
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
  /** Numa série: o valor muda só neste atendimento (o alcance do valor é outra pergunta). */
  valorSoNeste?: boolean;
};

/** Valida e monta os argumentos de editar_atendimentos (também usado pelo planejamento). */
export async function argsDeEdicao(e: Edicao): Promise<{ ok: true; args: ArgsEditar } | { ok: false; erro: string }> {
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
  return {
    ok: true,
    args: {
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
      p_valor_so_neste: e.valorSoNeste ?? false,
    },
  };
}

export async function editar(e: Edicao): Promise<Resultado> {
  const preparado = await argsDeEdicao(e);
  if (!preparado.ok) return preparado;
  const supabase = await createClient();
  if (await ehProfissional()) {
    const a = preparado.args;
    const { data, error } = await supabase.rpc("profissional_editar_atendimentos", {
      p_id: a.p_id,
      p_alcance: a.p_alcance,
      p_paciente_id: a.p_paciente_id,
      p_profissionais: a.p_profissionais,
      p_data: a.p_data,
      p_hora: a.p_hora,
      p_duracao_min: a.p_duracao_min,
      p_plano_id: a.p_plano_id,
      p_tipo_id: a.p_tipo_id,
    });
    return concluir(error, data ?? 0);
  }
  const { data, error } = await supabase.rpc("editar_atendimentos", preparado.args);
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
  if (await ehProfissional()) {
    const { error } = await supabase.rpc("profissional_mover_atendimento", { p_id: m.id, p_inicio: inicio });
    return concluir(error);
  }
  const { error } = await supabase.rpc("mover_atendimento", {
    p_id: m.id,
    p_inicio: inicio,
    p_de_profissional: m.deProfissional,
    p_para_profissional: m.paraProfissional,
  });
  return concluir(error);
}

/** Ajustes do paciente depois de salvar um atendimento (cada um opcional). */
export type AjustesDoPaciente = {
  pacienteId: string;
  /** O atendimento recém-salvo (já está como deve). */
  ignorarId: string | null;
  /** undefined: não mexe; string/null: novo plano padrão do paciente. */
  planoPadrao?: string | null;
  /** Atendimentos futuros do paciente passam para este plano (valor de cada área). */
  planoNosFuturos?: string;
  /** Mesmo valor nos atendimentos do paciente na mesma área (ou no mesmo tipo, se ele não tiver área). */
  valores?: { valor: number | null; escopo: "futuros" | "todos"; area: string | null; tipoId: string | null };
};

export async function ajustarPaciente(a: AjustesDoPaciente): Promise<Resultado> {
  const supabase = await createClient();
  let quantidade = 0;
  if (a.planoPadrao !== undefined) {
    const { error } = await supabase.from("pacientes").update({ plano_id: a.planoPadrao }).eq("id", a.pacienteId);
    if (error) return { ok: false, erro: "Não foi possível mudar o plano padrão do paciente." };
  }
  if (a.planoNosFuturos) {
    const { data, error } = await supabase.rpc("mudar_plano_dos_futuros", { p_paciente: a.pacienteId, p_plano: a.planoNosFuturos, p_ignorar: a.ignorarId ?? undefined });
    if (error) return { ok: false, erro: "Não foi possível mudar o plano dos atendimentos futuros." };
    quantidade += data ?? 0;
  }
  if (a.valores) {
    const { data, error } = await supabase.rpc("ajustar_valores_do_paciente", {
      p_paciente: a.pacienteId,
      p_area: a.valores.area as string,
      p_tipo: a.valores.tipoId as string,
      p_valor: a.valores.valor as number,
      p_escopo: a.valores.escopo,
      p_ignorar: a.ignorarId ?? undefined,
    });
    if (error) return { ok: false, erro: /administradores/.test(error.message) ? error.message : "Não foi possível ajustar os valores." };
    quantidade += data ?? 0;
  }
  revalidatePath("/agenda");
  revalidatePath("/pacientes", "layout");
  return { ok: true, quantidade };
}
