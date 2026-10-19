"use server";

import { revalidatePath } from "next/cache";
import { ehDataValida, hoje, inicioDoMes } from "@/lib/agenda/tempo";
import { ehAdm } from "@/lib/auth/usuario";
import { FORMAS, MOTIVOS_DE_BAIXA, type AtendimentoFinanceiro, type Forma, type MotivoDeBaixa } from "@/lib/financeiro/calculos";
import { carregarPendentes } from "@/lib/financeiro/dados";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

const SO_ADM: Resultado = {
  ok: false,
  erro: "Apenas a direção tem acesso ao financeiro.",
};

function revalidar() {
  revalidatePath("/financeiro", "layout");
}

/** Realizados e faltas com valor em aberto, de um paciente ou de um plano. */
export async function atendimentosPendentes(filtro: { pacienteId?: string; planoId?: string }): Promise<AtendimentoFinanceiro[]> {
  if (!(await ehAdm())) return [];
  if (!filtro.pacienteId && !filtro.planoId) return [];
  return carregarPendentes(filtro);
}

/** Pacientes (ativos e inativos), para a pesquisa do pagamento. */
export async function pacientesParaPagamento(): Promise<{ id: string; nome: string }[]> {
  if (!(await ehAdm())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("pacientes").select("id, nome").order("nome").limit(5000);
  if (error) throw new Error("Não foi possível carregar os pacientes.");
  return data;
}

export type NovoPagamento = {
  data: string;
  valor: number;
  forma: Forma;
  pacienteId: string | null;
  planoId: string | null;
  observacao: string;
  itens: { atendimentoId: string; valor: number }[];
};

export async function registrarPagamento(novo: NovoPagamento): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  if (!ehDataValida(novo.data)) return { ok: false, erro: "Informe a data." };
  if (!Number.isFinite(novo.valor) || novo.valor <= 0) return { ok: false, erro: "Informe o valor recebido." };
  if (!FORMAS.some((f) => f.valor === novo.forma)) return { ok: false, erro: "Escolha a forma de pagamento." };
  if (novo.itens.some((i) => !(i.valor > 0))) return { ok: false, erro: "Valor inválido num dos atendimentos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_pagamento", {
    p_data: novo.data,
    p_valor: novo.valor,
    p_forma: novo.forma,
    p_paciente: novo.pacienteId ?? undefined,
    p_plano: novo.planoId ?? undefined,
    p_observacao: novo.observacao,
    p_itens: novo.itens.map((i) => ({
      atendimento_id: i.atendimentoId,
      valor: i.valor,
    })),
  });
  // As mensagens da função são escritas para o usuário.
  if (error)
    return {
      ok: false,
      erro: error.code === "P0001" ? error.message : "Não foi possível registrar o pagamento.",
    };
  revalidar();
  return { ok: true };
}

export type NovaBaixa = {
  data: string;
  motivo: MotivoDeBaixa;
  observacao: string;
  itens: { atendimentoId: string; valor: number }[];
};

/** Baixa do saldo (glosa, desconto, perdão) em um ou vários atendimentos. */
export async function darBaixa(b: NovaBaixa): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  if (!ehDataValida(b.data)) return { ok: false, erro: "Informe a data." };
  if (!MOTIVOS_DE_BAIXA.some((m) => m.valor === b.motivo)) return { ok: false, erro: "Escolha o motivo." };
  if (b.itens.length === 0) return { ok: false, erro: "Selecione ao menos um atendimento." };
  if (b.itens.some((i) => !(i.valor > 0))) return { ok: false, erro: "Valor inválido num dos atendimentos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dar_baixa", {
    p_data: b.data,
    p_motivo: b.motivo,
    p_observacao: b.observacao,
    p_itens: b.itens.map((i) => ({
      atendimento_id: i.atendimentoId,
      valor: i.valor,
    })),
  });
  if (error)
    return {
      ok: false,
      erro: error.code === "P0001" ? error.message : "Não foi possível dar baixa.",
    };
  revalidar();
  return { ok: true };
}

/** Desfaz uma baixa: o valor volta a ficar em aberto. */
export async function excluirBaixa(id: string): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  const supabase = await createClient();
  const { error } = await supabase.from("baixas_atendimentos").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível desfazer a baixa." };
  revalidar();
  return { ok: true };
}

/** Tira o vínculo de um pagamento com um atendimento: o valor fica como crédito sem vínculo no pagamento. */
export async function desvincularQuitacao(pagamentoId: string, atendimentoId: string): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  const supabase = await createClient();
  const { error } = await supabase.from("pagamentos_atendimentos").delete().eq("pagamento_id", pagamentoId).eq("atendimento_id", atendimentoId);
  if (error) return { ok: false, erro: "Não foi possível desvincular." };
  revalidar();
  return { ok: true };
}

export async function excluirPagamento(id: string): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  const supabase = await createClient();
  const { error } = await supabase.from("pagamentos").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir o pagamento." };
  revalidar();
  return { ok: true };
}

export type DadosDaDespesa = {
  data: string;
  descricao: string;
  categoria: string;
  valor: number;
  pagaEm: string | null;
  observacao: string;
  /** Só no cadastro: repetir todo mês no dia do vencimento, até o mês dado (AAAA-MM-01) ou sem fim. */
  repetir?: { ate: string | null } | null;
};

function validarDespesa(d: DadosDaDespesa): string | null {
  if (!ehDataValida(d.data)) return "Informe a data de vencimento.";
  if (!d.descricao.trim()) return "Informe a descrição.";
  if (!Number.isFinite(d.valor) || d.valor <= 0) return "Informe o valor.";
  if (d.pagaEm !== null && !ehDataValida(d.pagaEm)) return "Data de pagamento inválida.";
  if (d.repetir?.ate && (!ehDataValida(d.repetir.ate) || d.repetir.ate < inicioDoMes(d.data)))
    return "O mês final da repetição é anterior ao vencimento.";
  return null;
}

const linhaDaDespesa = (d: DadosDaDespesa) => ({
  data: d.data,
  descricao: d.descricao.trim(),
  categoria: d.categoria.trim() || null,
  valor: d.valor,
  paga_em: d.pagaEm,
  observacao: d.observacao.trim() || null,
});

export async function salvarDespesa(id: string | null, d: DadosDaDespesa): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  const erro = validarDespesa(d);
  if (erro) return { ok: false, erro };
  const supabase = await createClient();
  if (!id && d.repetir) return criarRecorrente(d);
  const { error } = id
    ? await supabase.from("despesas").update(linhaDaDespesa(d)).eq("id", id)
    : await supabase.from("despesas").insert(linhaDaDespesa(d));
  if (error) return { ok: false, erro: "Não foi possível salvar a despesa." };
  revalidar();
  return { ok: true };
}

/**
 * Cria o modelo e o lançamento do primeiro mês (que pode já estar pago);
 * os meses seguintes até hoje são lançados em seguida.
 */
async function criarRecorrente(d: DadosDaDespesa): Promise<Resultado> {
  const supabase = await createClient();
  const linha = linhaDaDespesa(d);
  const mes = inicioDoMes(d.data);
  const { data: modelo, error } = await supabase
    .from("despesas_recorrentes")
    .insert({
      descricao: linha.descricao,
      categoria: linha.categoria,
      valor: linha.valor,
      observacao: linha.observacao,
      dia: Number(d.data.slice(8, 10)),
      inicio: mes,
      fim: d.repetir?.ate ?? null,
      gerada_ate: mes,
    })
    .select("id")
    .single();
  if (error) return { ok: false, erro: "Não foi possível salvar a despesa." };
  const primeiro = await supabase.from("despesas").insert({ ...linha, recorrente_id: modelo.id });
  if (primeiro.error) {
    await supabase.from("despesas_recorrentes").delete().eq("id", modelo.id);
    return { ok: false, erro: "Não foi possível salvar a despesa." };
  }
  await supabase.rpc("lancar_despesas_recorrentes", { p_ate: hoje() });
  revalidar();
  return { ok: true };
}

export type DadosDaRecorrente = {
  descricao: string;
  categoria: string;
  valor: number;
  dia: number;
  fim: string | null;
};

/** Altera o modelo e os lançamentos ainda não pagos a partir deste mês. */
export async function alterarRecorrente(id: string, d: DadosDaRecorrente): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  if (!d.descricao.trim()) return { ok: false, erro: "Informe a descrição." };
  if (!Number.isFinite(d.valor) || d.valor <= 0) return { ok: false, erro: "Informe o valor." };
  if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > 31) return { ok: false, erro: "O dia deve ser de 1 a 31." };
  if (d.fim !== null && !ehDataValida(d.fim)) return { ok: false, erro: "Mês final inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("alterar_despesa_recorrente", {
    p_id: id,
    p_descricao: d.descricao,
    p_categoria: d.categoria,
    p_valor: d.valor,
    p_dia: d.dia,
    p_fim: d.fim ?? undefined,
  });
  if (error)
    return {
      ok: false,
      erro: error.code === "P0001" ? error.message : "Não foi possível alterar a despesa recorrente.",
    };
  revalidar();
  return { ok: true };
}

/** Marca como paga (na data dada) ou volta para em aberto (null). */
export async function marcarDespesaPaga(id: string, pagaEm: string | null): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  if (pagaEm !== null && !ehDataValida(pagaEm)) return { ok: false, erro: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("despesas").update({ paga_em: pagaEm }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível atualizar a despesa." };
  revalidar();
  return { ok: true };
}

export async function excluirDespesa(id: string): Promise<Resultado> {
  if (!(await ehAdm())) return SO_ADM;
  const supabase = await createClient();
  const { error } = await supabase.from("despesas").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir a despesa." };
  revalidar();
  return { ok: true };
}
