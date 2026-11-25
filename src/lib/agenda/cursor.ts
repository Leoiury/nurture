// Horário selecionado na grade (teclado): mover para cima e para baixo de 15 em 15
// minutos, pulando as faixas compactadas (sem atendimentos).

import type { Segmento } from "./layout";

export const PASSO_DO_CURSOR = 15;

/** Primeiro horário selecionável da coluna (início do primeiro trecho não compactado). */
export function primeiroMinuto(segmentos: Segmento[]): number | null {
  return segmentos.find((s) => !s.compacto)?.inicio ?? null;
}

/** Leva o minuto para um horário selecionável: dentro de um trecho não compactado. */
export function ajustarMinuto(minuto: number, segmentos: Segmento[]): number | null {
  const abertos = segmentos.filter((s) => !s.compacto && s.fim - s.inicio >= PASSO_DO_CURSOR);
  if (abertos.length === 0) return null;
  const dentro = abertos.find((s) => minuto >= s.inicio && minuto < s.fim);
  if (dentro) return minuto - ((minuto - dentro.inicio) % PASSO_DO_CURSOR);
  // Fora: o trecho aberto mais próximo.
  let melhor = abertos[0].inicio;
  for (const s of abertos) {
    for (const candidato of [s.inicio, s.fim - PASSO_DO_CURSOR]) {
      if (Math.abs(candidato - minuto) < Math.abs(melhor - minuto)) melhor = candidato;
    }
  }
  return melhor;
}

/** Um passo para cima (-1) ou para baixo (+1); no limite da coluna, fica onde está. */
export function moverNaColuna(minuto: number, segmentos: Segmento[], direcao: -1 | 1): number {
  const abertos = segmentos.filter((s) => !s.compacto && s.fim - s.inicio >= PASSO_DO_CURSOR);
  const proximo = minuto + direcao * PASSO_DO_CURSOR;
  if (abertos.some((s) => proximo >= s.inicio && proximo + PASSO_DO_CURSOR <= s.fim)) return proximo;
  // Atravessa uma faixa compactada: vai para a borda do trecho aberto seguinte.
  if (direcao === 1) {
    const seguinte = abertos.find((s) => s.inicio > minuto);
    return seguinte ? seguinte.inicio : minuto;
  }
  const anterior = [...abertos].reverse().find((s) => s.fim <= minuto);
  return anterior ? anterior.fim - PASSO_DO_CURSOR : minuto;
}
