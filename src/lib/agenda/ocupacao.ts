// Mapa de ocupação de um profissional num período (dia, semana, mês…):
//   A) tempo na escala (sem feriados/recessos da clínica);
//   B) tempo em atendimento (desmarcados não contam; atendimentos simultâneos contam uma vez);
//   C) tempo livre na escala;
//   D) tempo não otimizado: intervalos livres maiores que 5 e menores que 30 min,
//      que não cabem uma sessão (dois de 15 min juntos liberariam uma de 30).
//
// Cálculo puro: quem chama fornece a escala e os atendimentos de cada dia. Assim
// serve tanto para a agenda real (relatórios) quanto para a simulada (planejamento).

import { duracaoTotal, intersecao, subtrair, unir, type Intervalo } from "./escala";

/** Limites (exclusivos) do intervalo livre considerado desperdício, em minutos. */
export const DESPERDICIO = { acimaDe: 5, abaixoDe: 30 };

export const ehDesperdicio = (i: Intervalo) => i.fim - i.inicio > DESPERDICIO.acimaDe && i.fim - i.inicio < DESPERDICIO.abaixoDe;

export type Totais = {
  /** A) minutos na escala. */
  escala: number;
  /** B) minutos em atendimento (inclusive fora da escala). */
  ocupado: number;
  /** Parte de B fora da escala (ex.: atendimento às 18:30 com escala até 18:00). */
  foraDaEscala: number;
  /** C) minutos livres na escala. */
  livre: number;
  /** D) minutos livres em intervalos entre 5 e 30 min. */
  naoOtimizado: number;
  /** Quantos intervalos não otimizados. */
  desperdicios: number;
};

export type MapaDoDia = Totais & {
  data: string;
  livres: Intervalo[];
  /** Os intervalos livres não otimizados (D). */
  intervalosDesperdicados: Intervalo[];
};

export type MapaDoPeriodo = { dias: MapaDoDia[]; total: Totais };

export function mapearDia(data: string, escala: Intervalo[], atendimentos: Intervalo[]): MapaDoDia {
  const ocupado = unir(atendimentos);
  const livres = subtrair(escala, ocupado);
  const intervalosDesperdicados = livres.filter(ehDesperdicio);
  const minutosOcupados = duracaoTotal(ocupado);
  return {
    data,
    escala: duracaoTotal(unir(escala)),
    ocupado: minutosOcupados,
    foraDaEscala: minutosOcupados - duracaoTotal(intersecao(ocupado, escala)),
    livre: duracaoTotal(livres),
    naoOtimizado: duracaoTotal(intervalosDesperdicados),
    desperdicios: intervalosDesperdicados.length,
    livres,
    intervalosDesperdicados,
  };
}

export function mapearPeriodo(dias: string[], escalaDoDia: (data: string) => Intervalo[], atendimentosDoDia: (data: string) => Intervalo[]): MapaDoPeriodo {
  const mapas = dias.map((d) => mapearDia(d, escalaDoDia(d), atendimentosDoDia(d)));
  const total: Totais = { escala: 0, ocupado: 0, foraDaEscala: 0, livre: 0, naoOtimizado: 0, desperdicios: 0 };
  for (const m of mapas) for (const k of Object.keys(total) as (keyof Totais)[]) total[k] += m[k];
  return { dias: mapas, total };
}

/** 150 → "2h30"; 45 → "45 min"; 120 → "2h". */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
