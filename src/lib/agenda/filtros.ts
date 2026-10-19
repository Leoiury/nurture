// Filtros avançados da agenda (menu lateral). Dentro de cada grupo, as opções
// somam (paciente A ou B); entre grupos, valem juntas (plano X e status marcado).
// Grupo vazio não filtra nada. Não ficam salvos: zeram ao reabrir a agenda.

import type { AtendimentoAgenda, Status } from "./dados";

export type NivelCadastral = "completo" | "falta_informacao" | "critico";
/** "sem": atendimento sem ícone de guia (o plano não exige e não tem guia). */
export type FiltroDeGuia = "ok" | "vencendo" | "falta" | "sem";

export type Filtros = {
  pacientes: { id: string; nome: string }[];
  /** Nome do plano; "" = sem plano. */
  planos: string[];
  guias: FiltroDeGuia[];
  status: Status[];
  /** Nome do tipo; "" = sem tipo. */
  tipos: string[];
  serie: "todos" | "serie" | "avulso";
  /** "sem": sem valor definido (para completar antes do financeiro). */
  valor: "todos" | "sem" | "com";
  cadastro: NivelCadastral[];
};

/** O que não passa no filtro: fica apagado (ocupando o horário) ou some da grade. */
export type ModoDoFiltro = "esmaecer" | "esconder";

export const FILTROS_VAZIOS: Filtros = { pacientes: [], planos: [], guias: [], status: [], tipos: [], serie: "todos", valor: "todos", cadastro: [] };

/** Quantos grupos estão filtrando. */
export function quantosFiltros(f: Filtros): number {
  return [f.pacientes, f.planos, f.guias, f.status, f.tipos, f.cadastro].filter((g) => g.length > 0).length + (f.serie === "todos" ? 0 : 1) + (f.valor === "todos" ? 0 : 1);
}

export function passaNoFiltro(a: AtendimentoAgenda, f: Filtros): boolean {
  const em = <T,>(lista: T[], valor: T) => lista.length === 0 || lista.includes(valor);
  return (
    (f.pacientes.length === 0 || f.pacientes.some((p) => p.id === a.pacienteId)) &&
    em(f.planos, a.plano?.nome ?? "") &&
    em<FiltroDeGuia>(f.guias, a.guia ?? "sem") &&
    em(f.status, a.status) &&
    em(f.tipos, a.tipo ?? "") &&
    (f.serie === "todos" || (f.serie === "serie") === !!a.recorrenciaId) &&
    (f.valor === "todos" || (f.valor === "sem") === !!a.semValor) &&
    (f.cadastro.length === 0 || (!!a.nivelCadastral && f.cadastro.includes(a.nivelCadastral)))
  );
}

/** Aplica os filtros: no modo "esmaecer", marca quem não passa; no "esconder", tira da lista. */
export function aplicarFiltros(lista: AtendimentoAgenda[], f: Filtros, modo: ModoDoFiltro): AtendimentoAgenda[] {
  if (quantosFiltros(f) === 0) return lista;
  if (modo === "esconder") return lista.filter((a) => passaNoFiltro(a, f));
  return lista.map((a) => (passaNoFiltro(a, f) ? a : { ...a, esmaecido: true }));
}

/**
 * Agenda ajustada ao filtro: só as colunas (profissionais) com algum atendimento que
 * combina, e só as horas ocupadas por eles. Esmaecidos ficam se caírem numa hora
 * dessas no mesmo dia (senão sairiam espremidos numa faixa condensada).
 * Nada combinando: a agenda fica como está.
 */
export function ajustarAoFiltro(lista: AtendimentoAgenda[], profissionalIds: string[]): { lista: AtendimentoAgenda[]; profissionalIds: string[] } {
  const combinam = lista.filter((a) => !a.esmaecido);
  if (combinam.length === 0) return { lista, profissionalIds };

  const usados = new Set(combinam.flatMap((a) => a.profissionalIds));
  const horas = new Set<string>();
  for (const a of combinam) for (let h = Math.floor(a.inicio / 60) * 60; h < a.fim; h += 60) horas.add(`${a.data}|${h}`);
  const cabe = (a: AtendimentoAgenda) => {
    for (let h = Math.floor(a.inicio / 60) * 60; h < a.fim; h += 60) if (!horas.has(`${a.data}|${h}`)) return false;
    return true;
  };
  return {
    lista: lista.filter((a) => !a.esmaecido || (cabe(a) && a.profissionalIds.some((id) => usados.has(id)))),
    profissionalIds: profissionalIds.filter((id) => usados.has(id)),
  };
}
