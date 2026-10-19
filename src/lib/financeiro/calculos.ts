// Cálculos do financeiro: totais do mês, situação de pagamento de cada
// atendimento, agrupamentos e o extrato. Sem acesso ao banco (testável).

import type { Database } from "@/lib/supabase/database.types";
import { ehDataValida, hoje, somarMeses } from "@/lib/agenda/tempo";

export type Status = Database["public"]["Enums"]["status_atendimento"];

export type AtendimentoFinanceiro = {
  id: string;
  inicio: string;
  /** Data (AAAA-MM-DD) no fuso da clínica. */
  data: string;
  status: Status;
  /** null = atendimento sem valor definido. */
  valor: number | null;
  /** Soma do que os pagamentos já quitaram dele. */
  recebido: number;
  /** Soma das baixas (glosa, desconto, perdão): o que não será recebido. */
  baixado: number;
  paciente: { id: string; nome: string } | null;
  plano: { id: string; nome: string; cor: string } | null;
  tipo: string | null;
  profissionais: { id: string; nome: string }[];
};

export type PagamentoFinanceiro = {
  id: string;
  data: string;
  valor: number;
  forma: Forma;
  observacao: string | null;
  paciente: { id: string; nome: string } | null;
  plano: { id: string; nome: string } | null;
  /** Quanto dele quita atendimentos (o resto é crédito sem vínculo). */
  vinculado: number;
  atendimentos: number;
};

export type DespesaFinanceira = {
  id: string;
  data: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  pagaEm: string | null;
  observacao: string | null;
  /** Lançada por uma despesa recorrente. */
  recorrente: boolean;
};

export type DespesaRecorrente = {
  id: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  /** Dia do mês do lançamento (31 em mês curto = último dia). */
  dia: number;
  /** Primeiro e último mês (dia 1); fim null = sem data para acabar. */
  inicio: string;
  fim: string | null;
};

export type Forma = "pix" | "dinheiro" | "cartao" | "transferencia" | "boleto" | "convenio" | "outro";

export const FORMAS: { valor: Forma; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "convenio", rotulo: "Repasse do convênio" },
  { valor: "outro", rotulo: "Outro" },
];

export const rotuloDaForma = (f: string) => FORMAS.find((x) => x.valor === f)?.rotulo ?? f;

export const CATEGORIAS_SUGERIDAS = [
  "Aluguel",
  "Repasse a profissionais",
  "Salários",
  "Impostos",
  "Materiais",
  "Água, luz e internet",
  "Manutenção",
  "Outros",
];

// Mês ---------------------------------------------------------------------------------

/** "2026-10" da URL → primeiro dia do mês; inválido ou ausente → mês atual. */
export function mesDaUrl(param: string | string[] | undefined): string {
  const s = typeof param === "string" ? `${param}-01` : "";
  return ehDataValida(s) ? s : `${hoje().slice(0, 7)}-01`;
}

/** Primeiro dia do mês e primeiro dia do mês seguinte (intervalo semiaberto). */
export function intervaloDoMes(mes: string): {
  inicio: string;
  fimExclusivo: string;
} {
  return { inicio: mes, fimExclusivo: somarMeses(mes, 1) };
}

// Situação de pagamento ----------------------------------------------------------------

export type SituacaoDePagamento = "pago" | "parcial" | "nao_pago" | "baixado" | "sem_valor";

export const SITUACOES: { valor: SituacaoDePagamento; rotulo: string }[] = [
  { valor: "nao_pago", rotulo: "Não pago" },
  { valor: "parcial", rotulo: "Pago em parte" },
  { valor: "pago", rotulo: "Pago" },
  { valor: "baixado", rotulo: "Baixado" },
  { valor: "sem_valor", rotulo: "Sem valor" },
];

export const MOTIVOS_DE_BAIXA: { valor: MotivoDeBaixa; rotulo: string }[] = [
  { valor: "glosa", rotulo: "Glosa do convênio" },
  { valor: "desconto", rotulo: "Desconto" },
  { valor: "perdao", rotulo: "Perdão da dívida" },
  { valor: "outro", rotulo: "Outro" },
];
export type MotivoDeBaixa = "glosa" | "desconto" | "perdao" | "outro";

type Valores = Pick<AtendimentoFinanceiro, "valor" | "recebido" | "baixado">;

/** Encerrado com alguma baixa = "baixado"; só com pagamentos = "pago". */
export function situacaoDePagamento(a: Valores): SituacaoDePagamento {
  if (a.valor === null || a.valor === 0) return a.recebido > 0 ? "pago" : "sem_valor";
  if (a.recebido + a.baixado + 0.005 >= a.valor) return a.baixado > 0 ? "baixado" : "pago";
  return a.recebido + a.baixado > 0 ? "parcial" : "nao_pago";
}

/** Quanto ainda falta receber (nunca negativo). */
export const saldo = (a: Valores) => Math.max(0, round((a.valor ?? 0) - a.recebido - a.baixado));

const round = (n: number) => Math.round(n * 100) / 100;
const soma = (ns: number[]) => round(ns.reduce((t, n) => t + n, 0));

// Grupos do status ----------------------------------------------------------------------

/** Esperado: tudo que não foi desmarcado. */
export const ehEsperado = (a: Pick<AtendimentoFinanceiro, "status">) => a.status !== "desmarcado";
export const ehRealizado = (a: Pick<AtendimentoFinanceiro, "status">) => a.status === "atendido";
export const ehFalta = (a: Pick<AtendimentoFinanceiro, "status">) => a.status === "faltou";

// Resumo do mês -------------------------------------------------------------------------

export type ResumoDoMes = {
  esperado: { valor: number; quantidade: number; semValor: number };
  realizados: { valor: number; quantidade: number };
  faltas: { valor: number; quantidade: number };
  /** Entrou no caixa no mês (pela data do pagamento, de qualquer atendimento). */
  recebido: { valor: number; quantidade: number };
  /** Quitado dos realizados do mês (por pagamentos de qualquer data). */
  recebidoDosRealizados: number;
  /** Baixas (glosa, desconto…) nos atendimentos do mês. */
  baixas: { valor: number; quantidade: number };
  /** Realizados ainda não quitados (inteiros ou em parte). */
  naoPagos: { valor: number; quantidade: number };
  /** O que falta receber dos realizados, por plano (maior primeiro). */
  aReceberPorPlano: {
    plano: string;
    cor: string | null;
    valor: number;
    quantidade: number;
  }[];
  despesas: {
    valor: number;
    quantidade: number;
    pagas: number;
    emAberto: number;
  };
};

export function resumoDoMes(atendimentos: AtendimentoFinanceiro[], pagamentos: PagamentoFinanceiro[], despesas: DespesaFinanceira[]): ResumoDoMes {
  const esperados = atendimentos.filter(ehEsperado);
  const realizados = atendimentos.filter(ehRealizado);
  const faltas = atendimentos.filter(ehFalta);
  const naoPagos = realizados.filter((a) => saldo(a) > 0);

  return {
    esperado: {
      valor: soma(esperados.map((a) => a.valor ?? 0)),
      quantidade: esperados.length,
      semValor: esperados.filter((a) => a.valor === null).length,
    },
    realizados: {
      valor: soma(realizados.map((a) => a.valor ?? 0)),
      quantidade: realizados.length,
    },
    faltas: {
      valor: soma(faltas.map((a) => a.valor ?? 0)),
      quantidade: faltas.length,
    },
    recebido: {
      valor: soma(pagamentos.map((p) => p.valor)),
      quantidade: pagamentos.length,
    },
    recebidoDosRealizados: soma(realizados.map((a) => a.recebido)),
    baixas: {
      valor: soma(atendimentos.map((a) => a.baixado)),
      quantidade: atendimentos.filter((a) => a.baixado > 0).length,
    },
    naoPagos: { valor: soma(naoPagos.map(saldo)), quantidade: naoPagos.length },
    aReceberPorPlano: agrupar(naoPagos, "plano").map((g) => ({
      plano: g.rotulo,
      cor: g.cor,
      valor: soma(g.itens.map(saldo)),
      quantidade: g.itens.length,
    })),
    despesas: {
      valor: soma(despesas.map((d) => d.valor)),
      quantidade: despesas.length,
      pagas: soma(despesas.filter((d) => d.pagaEm).map((d) => d.valor)),
      emAberto: soma(despesas.filter((d) => !d.pagaEm).map((d) => d.valor)),
    },
  };
}

// Agrupar e ordenar ---------------------------------------------------------------------

export type Agrupamento = "plano" | "paciente" | "profissional";

export type Grupo = {
  chave: string;
  rotulo: string;
  cor: string | null;
  itens: AtendimentoFinanceiro[];
};

/** Grupos ordenados pelo que falta receber (maior primeiro); empate pelo nome. */
export function agrupar(lista: AtendimentoFinanceiro[], por: Agrupamento): Grupo[] {
  const grupos = new Map<string, Grupo>();
  const incluir = (chave: string, rotulo: string, cor: string | null, a: AtendimentoFinanceiro) => {
    const g = grupos.get(chave) ?? { chave, rotulo, cor, itens: [] };
    g.itens.push(a);
    grupos.set(chave, g);
  };
  for (const a of lista) {
    if (por === "plano") incluir(a.plano?.id ?? "", a.plano?.nome ?? "Sem plano", a.plano?.cor ?? null, a);
    else if (por === "paciente") incluir(a.paciente?.id ?? "", a.paciente?.nome ?? "Sem paciente", null, a);
    else if (a.profissionais.length === 0) incluir("", "Sem profissional", null, a);
    else for (const p of a.profissionais) incluir(p.id, p.nome, null, a);
  }
  const total = (g: Grupo) => soma(g.itens.map(saldo));
  return [...grupos.values()].sort((a, b) => total(b) - total(a) || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

export type Ordem = "data" | "paciente" | "plano" | "valor" | "saldo";

export function ordenar(lista: AtendimentoFinanceiro[], por: Ordem, crescente: boolean): AtendimentoFinanceiro[] {
  const texto = (a: AtendimentoFinanceiro) => (por === "paciente" ? a.paciente?.nome : a.plano?.nome) ?? "";
  const comparar = (a: AtendimentoFinanceiro, b: AtendimentoFinanceiro): number => {
    if (por === "data") return a.inicio.localeCompare(b.inicio);
    if (por === "valor") return (a.valor ?? -1) - (b.valor ?? -1);
    if (por === "saldo") return saldo(a) - saldo(b);
    return texto(a).localeCompare(texto(b), "pt-BR") || a.inicio.localeCompare(b.inicio);
  };
  return [...lista].sort((a, b) => (crescente ? comparar(a, b) : comparar(b, a)));
}

// Extrato -------------------------------------------------------------------------------

export type LinhaDoExtrato = {
  id: string;
  data: string;
  tipo: "entrada" | "saida";
  descricao: string;
  detalhe: string;
  valor: number;
  /** Saldo acumulado do mês após esta linha. */
  acumulado: number;
};

/** Entradas (pagamentos) e saídas (despesas pagas), por data; empate: entradas antes. */
export function extrato(pagamentos: PagamentoFinanceiro[], despesasPagas: DespesaFinanceira[]): LinhaDoExtrato[] {
  const linhas = [
    ...pagamentos.map((p) => ({
      id: p.id,
      data: p.data,
      tipo: "entrada" as const,
      descricao: p.paciente?.nome ?? p.plano?.nome ?? "Recebimento",
      detalhe: [rotuloDaForma(p.forma), p.atendimentos ? `${p.atendimentos} atendimento${p.atendimentos === 1 ? "" : "s"}` : null, p.observacao]
        .filter(Boolean)
        .join(" · "),
      valor: p.valor,
    })),
    ...despesasPagas.map((d) => ({
      id: d.id,
      data: d.pagaEm!,
      tipo: "saida" as const,
      descricao: d.descricao,
      detalhe: [d.categoria, d.observacao].filter(Boolean).join(" · "),
      valor: -d.valor,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1));

  let acumulado = 0;
  return linhas.map((l) => ({
    ...l,
    acumulado: (acumulado = round(acumulado + l.valor)),
  }));
}
