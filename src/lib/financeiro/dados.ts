import "server-only";
import { inicioDoDiaISO, partesNoFuso } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";
import {
  intervaloDoMes,
  type AtendimentoFinanceiro,
  type DespesaFinanceira,
  type DespesaRecorrente,
  type Forma,
  type MotivoDeBaixa,
  type PagamentoFinanceiro,
} from "./calculos";

// O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas.
const PAGINA = 1000;
async function todas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw new Error("Não foi possível carregar os dados do financeiro.");
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return linhas;
  }
}

const SELECAO_DO_ATENDIMENTO =
  "id, inicio, status, valor, paciente:pacientes(id, nome), plano:planos(id, nome, cor), tipo:tipos_atendimento(nome), profissionais:atendimento_profissionais(profissional:profissionais(id, nome)), quitacoes:pagamentos_atendimentos(valor), baixas:baixas_atendimentos(valor)";

type LinhaDoAtendimento = {
  id: string;
  inicio: string;
  status: AtendimentoFinanceiro["status"];
  valor: number | null;
  paciente: { id: string; nome: string } | null;
  plano: { id: string; nome: string; cor: string } | null;
  tipo: { nome: string } | null;
  profissionais: { profissional: { id: string; nome: string } }[];
  quitacoes: { valor: number }[];
  baixas: { valor: number }[];
};

function paraAtendimento(a: LinhaDoAtendimento): AtendimentoFinanceiro {
  return {
    id: a.id,
    inicio: a.inicio,
    data: partesNoFuso(a.inicio).data,
    status: a.status,
    valor: a.valor === null ? null : Number(a.valor),
    recebido: a.quitacoes.reduce((t, q) => t + Number(q.valor), 0),
    baixado: a.baixas.reduce((t, b) => t + Number(b.valor), 0),
    paciente: a.paciente,
    plano: a.plano,
    tipo: a.tipo?.nome ?? null,
    profissionais: a.profissionais.map((p) => p.profissional),
  };
}

/** Atendimentos (não excluídos) do mês, com o quanto já foi quitado de cada um. */
export async function carregarAtendimentosDoMes(mes: string): Promise<AtendimentoFinanceiro[]> {
  const supabase = await createClient();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const linhas = await todas((de, ate) =>
    supabase
      .from("atendimentos")
      .select(SELECAO_DO_ATENDIMENTO)
      .is("excluido_em", null)
      .gte("inicio", inicioDoDiaISO(inicio))
      .lt("inicio", inicioDoDiaISO(fimExclusivo))
      .order("inicio")
      .order("id")
      .range(de, ate),
  );
  return (linhas as unknown as LinhaDoAtendimento[]).map(paraAtendimento);
}

/**
 * Realizados e faltas com saldo em aberto, de todos os meses (opcionalmente de
 * um paciente ou de um plano). O filtro do saldo é feito no banco.
 */
export async function carregarPendentes(filtro: { pacienteId?: string; planoId?: string } = {}): Promise<AtendimentoFinanceiro[]> {
  const supabase = await createClient();
  const linhas = await todas((de, ate) => {
    let q = supabase.from("atendimentos_em_aberto").select(SELECAO_DO_ATENDIMENTO);
    if (filtro.pacienteId) q = q.eq("paciente_id", filtro.pacienteId);
    if (filtro.planoId) q = q.eq("plano_id", filtro.planoId);
    return q.order("inicio").order("id").range(de, ate);
  });
  return (linhas as unknown as LinhaDoAtendimento[]).map(paraAtendimento);
}

/** Realizados com saldo em aberto, de todos os meses. */
export async function carregarTotalEmAberto(): Promise<{
  valor: number;
  quantidade: number;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("total_em_aberto").single();
  if (error) throw new Error("Não foi possível calcular o total em aberto.");
  return { valor: Number(data.valor), quantidade: data.quantidade };
}

export type QuitacaoARevisar = {
  pagamentoId: string;
  atendimentoId: string;
  valor: number;
  motivo: "excluido" | "status" | "valor";
  pagamento: { data: string; valor: number } | null;
  atendimento: {
    inicio: string;
    data: string;
    status: string;
    valor: number | null;
    paciente: string | null;
  };
};

/** Quitações de atendimentos excluídos, desmarcados (ou de volta a marcado) ou que receberam mais do que valem. */
export async function carregarQuitacoesARevisar(): Promise<QuitacaoARevisar[]> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase.from("quitacoes_a_revisar").select("pagamento_id, atendimento_id, valor, motivo").limit(1000);
  if (error) throw new Error("Não foi possível carregar os pagamentos a revisar.");
  if (linhas.length === 0) return [];
  const ids = (k: "pagamento_id" | "atendimento_id") => [...new Set(linhas.map((l) => l[k]!))];
  const [pagamentos, atendimentos] = await Promise.all([
    supabase.from("pagamentos").select("id, data, valor").in("id", ids("pagamento_id")),
    // Inclui os excluídos (não filtra excluido_em).
    supabase.from("atendimentos").select("id, inicio, status, valor, paciente:pacientes(nome)").in("id", ids("atendimento_id")),
  ]);
  if (pagamentos.error || atendimentos.error) throw new Error("Não foi possível carregar os pagamentos a revisar.");
  return linhas.map((l) => {
    const p = pagamentos.data.find((x) => x.id === l.pagamento_id);
    const a = atendimentos.data.find((x) => x.id === l.atendimento_id)!;
    return {
      pagamentoId: l.pagamento_id!,
      atendimentoId: l.atendimento_id!,
      valor: Number(l.valor),
      motivo: l.motivo as QuitacaoARevisar["motivo"],
      pagamento: p ? { data: p.data, valor: Number(p.valor) } : null,
      atendimento: {
        inicio: a.inicio,
        data: partesNoFuso(a.inicio).data,
        status: a.status,
        valor: a.valor === null ? null : Number(a.valor),
        paciente: a.paciente?.nome ?? null,
      },
    };
  });
}

export type BaixaDoMes = {
  id: string;
  data: string;
  valor: number;
  motivo: MotivoDeBaixa;
  observacao: string | null;
  paciente: string | null;
  plano: string | null;
  dataDoAtendimento: string;
};

/** Baixas registradas no mês (pela data da baixa). */
export async function carregarBaixasDoMes(mes: string): Promise<BaixaDoMes[]> {
  const supabase = await createClient();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const linhas = await todas((de, ate) =>
    supabase
      .from("baixas_atendimentos")
      .select("id, data, valor, motivo, observacao, atendimento:atendimentos(inicio, paciente:pacientes(nome), plano:planos(nome))")
      .gte("data", inicio)
      .lt("data", fimExclusivo)
      .order("data")
      .order("criado_em")
      .range(de, ate),
  );
  return linhas.map((b) => ({
    id: b.id,
    data: b.data,
    valor: Number(b.valor),
    motivo: b.motivo as MotivoDeBaixa,
    observacao: b.observacao,
    paciente: b.atendimento?.paciente?.nome ?? null,
    plano: b.atendimento?.plano?.nome ?? null,
    dataDoAtendimento: b.atendimento ? partesNoFuso(b.atendimento.inicio).data : b.data,
  }));
}

export async function carregarPagamentosDoMes(mes: string): Promise<PagamentoFinanceiro[]> {
  const supabase = await createClient();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const linhas = await todas((de, ate) =>
    supabase
      .from("pagamentos")
      .select("id, data, valor, forma, observacao, paciente:pacientes(id, nome), plano:planos(id, nome), quitacoes:pagamentos_atendimentos(valor)")
      .gte("data", inicio)
      .lt("data", fimExclusivo)
      .order("data")
      .order("criado_em")
      .range(de, ate),
  );
  return linhas.map((p) => ({
    id: p.id,
    data: p.data,
    valor: Number(p.valor),
    forma: p.forma as Forma,
    observacao: p.observacao,
    paciente: p.paciente,
    plano: p.plano,
    vinculado: p.quitacoes.reduce((t, q) => t + Number(q.valor), 0),
    atendimentos: p.quitacoes.length,
  }));
}

const SELECAO_DA_DESPESA = "id, data, descricao, categoria, valor, paga_em, observacao, recorrente_id";

function paraDespesa(d: {
  id: string;
  data: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  paga_em: string | null;
  observacao: string | null;
  recorrente_id: string | null;
}): DespesaFinanceira {
  return {
    id: d.id,
    data: d.data,
    descricao: d.descricao,
    categoria: d.categoria,
    valor: Number(d.valor),
    pagaEm: d.paga_em,
    observacao: d.observacao,
    recorrente: !!d.recorrente_id,
  };
}

/** Despesas do mês (pela data de vencimento), já com as recorrentes lançadas até ele. */
export async function carregarDespesasDoMes(mes: string): Promise<DespesaFinanceira[]> {
  const supabase = await createClient();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const { error: erroAoLancar } = await supabase.rpc("lancar_despesas_recorrentes", { p_ate: inicio });
  if (erroAoLancar) throw new Error("Não foi possível lançar as despesas recorrentes.");
  const linhas = await todas((de, ate) =>
    supabase.from("despesas").select(SELECAO_DA_DESPESA).gte("data", inicio).lt("data", fimExclusivo).order("data").order("criado_em").range(de, ate),
  );
  return linhas.map(paraDespesa);
}

/** Despesas pagas no mês (pela data do pagamento), para o extrato. */
export async function carregarDespesasPagasNoMes(mes: string): Promise<DespesaFinanceira[]> {
  const supabase = await createClient();
  const { inicio, fimExclusivo } = intervaloDoMes(mes);
  const linhas = await todas((de, ate) =>
    supabase.from("despesas").select(SELECAO_DA_DESPESA).gte("paga_em", inicio).lt("paga_em", fimExclusivo).order("paga_em").range(de, ate),
  );
  return linhas.map(paraDespesa);
}

/** Despesas recorrentes que ainda não acabaram (fim no mês atual ou depois, ou sem fim). */
export async function carregarRecorrentes(mesAtual: string): Promise<DespesaRecorrente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("despesas_recorrentes")
    .select("id, descricao, categoria, valor, dia, inicio, fim")
    .or(`fim.is.null,fim.gte.${mesAtual}`)
    .order("descricao");
  if (error) throw new Error("Não foi possível carregar as despesas recorrentes.");
  return data.map((r) => ({ ...r, valor: Number(r.valor) }));
}

/** Categorias já usadas (para sugerir no cadastro). */
export async function carregarCategorias(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("despesas").select("categoria").not("categoria", "is", null).limit(1000);
  return [...new Set((data ?? []).map((d) => d.categoria!))];
}

export async function carregarPlanos(): Promise<{ id: string; nome: string; cor: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("planos").select("id, nome, cor").order("nome");
  if (error) throw new Error("Não foi possível carregar os planos.");
  return data;
}
