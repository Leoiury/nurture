// Filtros da lista de atendimentos do financeiro (também lidos da URL, no servidor).

import { SITUACOES, situacaoDePagamento, type Agrupamento, type AtendimentoFinanceiro, type SituacaoDePagamento } from "./calculos";

export type FiltroDeStatus = "esperado" | "atendido" | "faltou" | "desmarcado" | "todos";
/** "aberto" = não pago ou pago em parte. */
export type FiltroDePagamento = SituacaoDePagamento | "aberto" | "todos";

export type Filtros = {
  status: FiltroDeStatus;
  pagamento: FiltroDePagamento;
  agrupar: Agrupamento | null;
  planos: string[];
};

export const STATUS: [FiltroDeStatus, string][] = [
  ["esperado", "Esperados"],
  ["atendido", "Realizados"],
  ["faltou", "Faltas"],
  ["desmarcado", "Desmarcados"],
  ["todos", "Todos"],
];

export const PAGAMENTOS: [FiltroDePagamento, string][] = [
  ["todos", "Todos"],
  ["aberto", "Em aberto"],
  ...SITUACOES.map((s): [FiltroDePagamento, string] => [s.valor, s.rotulo]),
];

export function filtrosDaUrl(p: Record<string, string | string[] | undefined>): Filtros {
  const um = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const status = STATUS.find(([v]) => v === um("status"))?.[0] ?? "esperado";
  const pagamento = PAGAMENTOS.find(([v]) => v === um("pagamento"))?.[0] ?? "todos";
  const agrupar = (["plano", "paciente", "profissional"] as const).find((v) => v === um("agrupar")) ?? null;
  return {
    status,
    pagamento,
    agrupar,
    planos: um("plano") ? um("plano").split(",") : [],
  };
}

export function passaNoStatus(a: AtendimentoFinanceiro, f: FiltroDeStatus) {
  if (f === "todos") return true;
  if (f === "esperado") return a.status !== "desmarcado";
  return a.status === f;
}

export function passaNoPagamento(a: AtendimentoFinanceiro, f: FiltroDePagamento) {
  if (f === "todos") return true;
  const s = situacaoDePagamento(a);
  return f === "aberto" ? s === "nao_pago" || s === "parcial" : s === f;
}
