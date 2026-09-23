// Peças compartilhadas pelas visões da agenda.

import type { AtendimentoAgenda } from "@/lib/agenda/dados";
import { distribuirEmFaixas, type Faixa } from "@/lib/agenda/layout";
import { formatarHora } from "@/lib/agenda/tempo";

export type Visao = "empilhada" | "lado";

export type Posicionado = AtendimentoAgenda & Faixa;

/** Faixa de horário sempre considerada no dia, mesmo sem atendimentos. */
export const HORARIO_PADRAO = { inicio: 8 * 60, fim: 18 * 60 };

const COR_SEM_PLANO = "#9ca3af";

export function corDoPlano(a: AtendimentoAgenda): string {
  return a.plano?.cor ?? COR_SEM_PLANO;
}

/** Fundo suave do card, derivado da cor do plano. */
export function fundoDoCard(cor: string): string {
  return `color-mix(in srgb, ${cor} 26%, white)`;
}

export function iniciais(nome: string): string {
  const partes = nome.split(" ").filter((p) => p.length > 2);
  return ((partes[0]?.[0] ?? nome[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

export function horarioDoAtendimento(a: AtendimentoAgenda): string {
  return `${formatarHora(a.inicio)} – ${formatarHora(a.fim)}`;
}

/** Texto completo do atendimento (tooltip e leitor de tela). */
export function descricaoDoAtendimento(a: AtendimentoAgenda, profissional: string): string {
  return [horarioDoAtendimento(a), a.paciente ?? "Sem paciente", profissional, a.plano?.nome, a.tipo, a.status]
    .filter(Boolean)
    .join(" · ");
}

/** Atendimentos agrupados por "dia|profissional", já distribuídos em faixas paralelas. */
export function agruparPorColuna(atendimentos: AtendimentoAgenda[]): Map<string, Posicionado[]> {
  const grupos = new Map<string, AtendimentoAgenda[]>();
  for (const a of atendimentos) {
    const chave = `${a.data}|${a.profissionalId}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  const resultado = new Map<string, Posicionado[]>();
  for (const [chave, itens] of grupos) {
    const faixas = distribuirEmFaixas(itens);
    resultado.set(chave, itens.map((a, i) => ({ ...a, ...faixas[i] })));
  }
  return resultado;
}

/** Expande segmentos compactos: guarda "escopo|minutoDaHora" (escopo = dia, ou "*" para todos). */
export function horasExpandidas(expandidos: Set<string>, escopo: string): Set<number> {
  return new Set([...expandidos].filter((k) => k.startsWith(`${escopo}|`)).map((k) => Number(k.split("|")[1])));
}
