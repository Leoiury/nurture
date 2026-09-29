// Escala de trabalho dos profissionais (tabela jornadas) e operações com
// intervalos de tempo. Módulo sem React e sem servidor.
//
// Quem não tem escala cadastrada segue o expediente padrão (seg–sex, 08–12 e 13–18).
// Feriados e recessos da clínica zeram a escala do dia.

import { semExpediente, type DiaEspecial } from "./feriados";
import { diaDaSemana } from "./tempo";

export type Intervalo = { inicio: number; fim: number }; // minutos desde 00:00

/** Dia da semana (0 = domingo … 6 = sábado) → intervalos de trabalho. */
export type Escala = Partial<Record<number, Intervalo[]>>;

export const EXPEDIENTE_PADRAO: Intervalo[] = [
  { inicio: 8 * 60, fim: 12 * 60 },
  { inicio: 13 * 60, fim: 18 * 60 },
];

export const ESCALA_PADRAO: Escala = { 1: EXPEDIENTE_PADRAO, 2: EXPEDIENTE_PADRAO, 3: EXPEDIENTE_PADRAO, 4: EXPEDIENTE_PADRAO, 5: EXPEDIENTE_PADRAO };

export const NOMES_DOS_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
/** Ordem de exibição: segunda a domingo. */
export const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0];

/** Intervalos de trabalho num dia (sem escala própria: o padrão; feriado/recesso: nenhum). */
export function escalaDoDia(escala: Escala | null, data: string, especial?: DiaEspecial[]): Intervalo[] {
  if (semExpediente(especial)) return [];
  return (escala ?? ESCALA_PADRAO)[diaDaSemana(data)] ?? [];
}

/** Junta intervalos sobrepostos ou encostados, em ordem. */
export function unir(lista: Intervalo[]): Intervalo[] {
  const ordenados = lista.filter((i) => i.fim > i.inicio).toSorted((a, b) => a.inicio - b.inicio);
  const r: Intervalo[] = [];
  for (const i of ordenados) {
    const ultimo = r.at(-1);
    if (ultimo && i.inicio <= ultimo.fim) ultimo.fim = Math.max(ultimo.fim, i.fim);
    else r.push({ ...i });
  }
  return r;
}

/** Partes comuns aos dois conjuntos (ex.: quando dois profissionais trabalham juntos). */
export function intersecao(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const r: Intervalo[] = [];
  for (const x of unir(a))
    for (const y of unir(b)) {
      const inicio = Math.max(x.inicio, y.inicio);
      const fim = Math.min(x.fim, y.fim);
      if (fim > inicio) r.push({ inicio, fim });
    }
  return unir(r);
}

/** O que sobra de `base` tirando `menos`. */
export function subtrair(base: Intervalo[], menos: Intervalo[]): Intervalo[] {
  let r = unir(base);
  for (const m of unir(menos)) {
    r = r.flatMap((i) => {
      if (m.fim <= i.inicio || m.inicio >= i.fim) return [i];
      return [
        ...(m.inicio > i.inicio ? [{ inicio: i.inicio, fim: m.inicio }] : []),
        ...(m.fim < i.fim ? [{ inicio: m.fim, fim: i.fim }] : []),
      ];
    });
  }
  return r;
}

export const duracaoTotal = (lista: Intervalo[]) => lista.reduce((s, i) => s + (i.fim - i.inicio), 0);

/** Problema na escala de um dia (null se estiver certa). */
export function problemaNoDia(intervalos: Intervalo[]): string | null {
  if (intervalos.some((i) => !(i.fim > i.inicio))) return "O fim precisa ser depois do início.";
  const ordenados = intervalos.toSorted((a, b) => a.inicio - b.inicio);
  if (ordenados.some((i, k) => k > 0 && i.inicio < ordenados[k - 1].fim)) return "Há intervalos sobrepostos.";
  return null;
}

/** Linhas da tabela jornadas → escala (null se o profissional não tiver nenhuma). */
export function escalaDasJornadas(jornadas: { dia_semana: number; hora_inicio: string; hora_fim: string }[]): Escala | null {
  if (jornadas.length === 0) return null;
  const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  const escala: Escala = {};
  for (const j of jornadas) escala[j.dia_semana] = [...(escala[j.dia_semana] ?? []), { inicio: minutos(j.hora_inicio), fim: minutos(j.hora_fim) }];
  for (const dia of Object.keys(escala)) escala[Number(dia)] = unir(escala[Number(dia)]!);
  return escala;
}
