// Peças compartilhadas pelas visões da agenda.

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import type { AtendimentoAgenda } from "@/lib/agenda/dados";
import { distribuirEmFaixas, type Faixa } from "@/lib/agenda/layout";
import { CHAVE_FOCO } from "@/lib/agenda/preferencias";
import { formatarHora } from "@/lib/agenda/tempo";

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

// Escala vertical -------------------------------------------------------------------

const QUARTOS_NO_EXPEDIENTE = (HORARIO_PADRAO.fim - HORARIO_PADRAO.inicio) / 15;

/**
 * Pixels por 15 min para que o expediente (08–18) caiba na altura disponível.
 * Com zoom no navegador a altura em px diminui e a escala acompanha, até o mínimo
 * legível; abaixo dele a grade passa a rolar.
 */
export function escalaParaCaber(alturaDisponivel: number | null, limites: { padrao: number; min: number; max: number }): number {
  if (!alturaDisponivel) return limites.padrao;
  const ideal = Math.floor((alturaDisponivel / QUARTOS_NO_EXPEDIENTE) * 2) / 2;
  return Math.min(limites.max, Math.max(limites.min, ideal));
}

/** Altura interna de um elemento, atualizada quando ele muda de tamanho (janela, zoom). */
export function useAlturaDoElemento(ref: RefObject<HTMLElement | null>): number | null {
  const [altura, setAltura] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setAltura(entrada.contentRect.height));
    observador.observe(el);
    return () => observador.disconnect();
  }, [ref]);
  return altura;
}

// Grade e cards --------------------------------------------------------------------

/** Fundo de um segmento de 1 hora: linha fina na meia hora (a linha da hora é a borda superior). */
export const FUNDO_DA_HORA =
  "linear-gradient(to bottom, transparent calc(50% - 0.5px), var(--grid-half-hour) calc(50% - 0.5px), var(--grid-half-hour) calc(50% + 0.5px), transparent calc(50% + 0.5px))";

/** Visão ampliada: além da meia hora, linhas bem suaves a cada 15 min para medir o tempo livre. */
export const FUNDO_DA_HORA_AMPLIADA = [
  "linear-gradient(to bottom, transparent calc(25% - 0.5px), var(--grid-quarter-hour) calc(25% - 0.5px), var(--grid-quarter-hour) calc(25% + 0.5px), transparent calc(25% + 0.5px))",
  FUNDO_DA_HORA,
  "linear-gradient(to bottom, transparent calc(75% - 0.5px), var(--grid-quarter-hour) calc(75% - 0.5px), var(--grid-quarter-hour) calc(75% + 0.5px), transparent calc(75% + 0.5px))",
].join(", ");

/**
 * Posição horizontal de um card na coluna, com largura mínima e máxima.
 * Paralelos dividem a coluna; se não couberem na largura mínima, ficam em
 * cascata (sobrepostos) em vez de virarem tiras ilegíveis.
 */
export function geometriaDoCard(faixa: number, faixas: number, min: number, max: number): { left: string; width: string } {
  if (faixas === 1) return { left: "0px", width: `min(100%, ${max}px)` };
  const largura = `clamp(${min}px, calc(100% / ${faixas} - 2px), ${max}px)`;
  return { width: largura, left: `min(calc(${faixa} * (${largura} + 2px)), calc(100% - ${largura}))` };
}

// Modo foco --------------------------------------------------------------------------
// Esconde o cabeçalho do app (via atributo no <html>) e fica lembrado neste navegador.

const EVENTO_FOCO = "nurture:foco";
let focoEmMemoria = false; // se o armazenamento do navegador estiver bloqueado

function lerFoco(): boolean {
  try {
    return localStorage.getItem(CHAVE_FOCO) === "1";
  } catch {
    return focoEmMemoria;
  }
}

function assinarFoco(aoMudar: () => void) {
  window.addEventListener(EVENTO_FOCO, aoMudar);
  return () => window.removeEventListener(EVENTO_FOCO, aoMudar);
}

export function useModoFoco(): [boolean, (ativo: boolean) => void] {
  const foco = useSyncExternalStore(assinarFoco, lerFoco, () => false);

  // Só aplica: na hidratação o valor começa em false (o do servidor) e não pode
  // desfazer o que o script do <head> já marcou. Desligar é feito em definir().
  useEffect(() => {
    if (foco) document.documentElement.setAttribute("data-foco", "");
  }, [foco]);

  // Fora da agenda o cabeçalho volta a aparecer.
  useEffect(() => () => document.documentElement.removeAttribute("data-foco"), []);

  function definir(ativo: boolean) {
    focoEmMemoria = ativo;
    document.documentElement.toggleAttribute("data-foco", ativo);
    try {
      localStorage.setItem(CHAVE_FOCO, ativo ? "1" : "0");
    } catch {
      // armazenamento indisponível: vale só enquanto a página estiver aberta
    }
    window.dispatchEvent(new Event(EVENTO_FOCO));
  }

  return [foco, definir];
}
