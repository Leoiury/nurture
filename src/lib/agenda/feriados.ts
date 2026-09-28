// Feriados e recessos. Os nacionais são calculados (fixos + móveis a partir da
// Páscoa); estaduais, municipais e recessos vêm do cadastro da clínica.

import { somarDias } from "./tempo";

/** feriado e recesso: dia sem expediente; facultativo: ponto facultativo (só aviso). */
export type TipoDiaEspecial = "feriado" | "recesso" | "facultativo";

export type DiaEspecial = {
  data: string; // AAAA-MM-DD
  nome: string;
  tipo: TipoDiaEspecial;
  /** nacional (calculado) ou cadastro (tela de configurações). */
  origem: "nacional" | "cadastro";
};

/** Linha do cadastro (tabela feriados): um dia ou um período. */
export type Cadastro = { nome: string; tipo: "feriado" | "recesso"; data_inicio: string; data_fim: string };

const FIXOS: [string, string, TipoDiaEspecial][] = [
  ["01-01", "Confraternização Universal", "feriado"],
  ["04-21", "Tiradentes", "feriado"],
  ["05-01", "Dia do Trabalho", "feriado"],
  ["09-07", "Independência do Brasil", "feriado"],
  ["10-12", "Nossa Senhora Aparecida", "feriado"],
  ["11-02", "Finados", "feriado"],
  ["11-15", "Proclamação da República", "feriado"],
  ["11-20", "Dia Nacional de Zumbi e da Consciência Negra", "feriado"],
  ["12-25", "Natal", "feriado"],
];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function feriadosNacionais(ano: number): DiaEspecial[] {
  const p = pascoa(ano);
  const moveis: [string, string, TipoDiaEspecial][] = [
    [somarDias(p, -48), "Carnaval", "facultativo"],
    [somarDias(p, -47), "Carnaval", "facultativo"],
    [somarDias(p, -2), "Sexta-feira Santa", "feriado"],
    [somarDias(p, 60), "Corpus Christi", "facultativo"],
  ];
  return [...FIXOS.map(([md, nome, tipo]) => [`${ano}-${md}`, nome, tipo] as const), ...moveis]
    .map(([data, nome, tipo]) => ({ data, nome, tipo, origem: "nacional" as const }))
    .sort((x, y) => x.data.localeCompare(y.data));
}

/**
 * Dias especiais entre as datas (inclusive), por dia. Um dia pode ter mais de um
 * (ex.: feriado nacional dentro de um recesso); o mais restritivo vem primeiro.
 */
export function diasEspeciais(inicio: string, fim: string, cadastros: Cadastro[]): Map<string, DiaEspecial[]> {
  const mapa = new Map<string, DiaEspecial[]>();
  const incluir = (d: DiaEspecial) => {
    if (d.data < inicio || d.data > fim) return;
    mapa.set(d.data, [...(mapa.get(d.data) ?? []), d]);
  };

  for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++) {
    feriadosNacionais(ano).forEach(incluir);
  }
  for (const c of cadastros) {
    const de = c.data_inicio > inicio ? c.data_inicio : inicio;
    const ate = c.data_fim < fim ? c.data_fim : fim;
    for (let d = de; d <= ate; d = somarDias(d, 1)) incluir({ data: d, nome: c.nome, tipo: c.tipo, origem: "cadastro" });
  }

  const peso: Record<TipoDiaEspecial, number> = { recesso: 0, feriado: 1, facultativo: 2 };
  for (const lista of mapa.values()) lista.sort((a, b) => peso[a.tipo] - peso[b.tipo]);
  return mapa;
}

/** Dia sem expediente (feriado ou recesso). Ponto facultativo não bloqueia. */
export function semExpediente(dias: DiaEspecial[] | undefined): boolean {
  return !!dias?.some((d) => d.tipo !== "facultativo");
}

export const ROTULO_TIPO_DIA: Record<TipoDiaEspecial, string> = {
  feriado: "Feriado",
  recesso: "Recesso",
  facultativo: "Ponto facultativo",
};
