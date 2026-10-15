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
  cadastro: NivelCadastral[];
};

/** O que não passa no filtro: fica apagado (ocupando o horário) ou some da grade. */
export type ModoDoFiltro = "esmaecer" | "esconder";

export const FILTROS_VAZIOS: Filtros = { pacientes: [], planos: [], guias: [], status: [], tipos: [], serie: "todos", cadastro: [] };

/** Quantos grupos estão filtrando. */
export function quantosFiltros(f: Filtros): number {
  return [f.pacientes, f.planos, f.guias, f.status, f.tipos, f.cadastro].filter((g) => g.length > 0).length + (f.serie === "todos" ? 0 : 1);
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
    (f.cadastro.length === 0 || (!!a.nivelCadastral && f.cadastro.includes(a.nivelCadastral)))
  );
}

/** Aplica os filtros: no modo "esmaecer", marca quem não passa; no "esconder", tira da lista. */
export function aplicarFiltros(lista: AtendimentoAgenda[], f: Filtros, modo: ModoDoFiltro): AtendimentoAgenda[] {
  if (quantosFiltros(f) === 0) return lista;
  if (modo === "esconder") return lista.filter((a) => passaNoFiltro(a, f));
  return lista.map((a) => (passaNoFiltro(a, f) ? a : { ...a, esmaecido: true }));
}
