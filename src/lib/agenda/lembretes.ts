// Lembretes da agenda: aniversários de pacientes e datas comemorativas, com
// antecedência (os próximos 15 dias) e no próprio dia. Módulo sem React e sem servidor.

import { pascoa as domingoDePascoa } from "./feriados";
import { diaDaSemana, somarDias } from "./tempo";

/** Quantos dias à frente (contando hoje) os lembretes avisam. */
export const ANTECEDENCIA_DIAS = 15;

export type DataComemorativa = {
  id: string;
  nome: string;
  descricao?: string | null;
  /** Fixa: mes + dia (-1 = último dia do mês). Móvel: mes + ordem + dia_semana. Páscoa: pascoa (dias; -47 = Carnaval). */
  mes: number | null;
  dia: number | null;
  ordem: number | null;
  dia_semana: number | null;
  pascoa?: number | null;
};

export type Aniversario = { data: string; pacienteId: string; nome: string; idade: number };
export type Comemoracao = { data: string; id: string; nome: string; descricao?: string | null };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** Segunda a sexta são femininos ("1ª segunda"); sábado e domingo, masculinos ("2º domingo"). */
function ordinal(ordem: number, diaSemana: number): string {
  const feminino = diaSemana >= 1 && diaSemana <= 5;
  if (ordem === -1) return feminino ? "última" : "último";
  return `${ordem}${feminino ? "ª" : "º"}`;
}

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

type Regra = Pick<DataComemorativa, "mes" | "dia" | "ordem" | "dia_semana" | "pascoa">;

/** Em que dia a data cai no ano (null se não existir, ex.: 5º domingo que não há). */
export function dataNoAno(d: Regra, ano: number): string | null {
  if (d.pascoa !== null && d.pascoa !== undefined) return somarDias(domingoDePascoa(ano), d.pascoa);
  if (d.mes === null) return null;
  const total = diasNoMes(ano, d.mes);
  if (d.dia === -1) return iso(ano, d.mes, total);
  if (d.dia !== null) return d.dia <= total ? iso(ano, d.mes, d.dia) : null;
  if (d.ordem === null || d.dia_semana === null) return null;
  if (d.ordem === -1) {
    const ultimo = iso(ano, d.mes, total);
    return somarDias(ultimo, -((diaDaSemana(ultimo) - d.dia_semana + 7) % 7));
  }
  const primeiro = iso(ano, d.mes, 1);
  const dia = 1 + ((d.dia_semana - diaDaSemana(primeiro) + 7) % 7) + (d.ordem - 1) * 7;
  return dia <= total ? iso(ano, d.mes, dia) : null;
}

/** "12 de outubro", "último dia de fevereiro", "2º domingo de maio" ou "47 dias antes da Páscoa". */
export function descreverRegra(d: Regra): string {
  if (d.pascoa !== null && d.pascoa !== undefined) {
    if (d.pascoa === 0) return "domingo de Páscoa";
    const n = Math.abs(d.pascoa);
    return `${n} dia${n === 1 ? "" : "s"} ${d.pascoa < 0 ? "antes" : "depois"} da Páscoa`;
  }
  const mes = MESES[(d.mes ?? 1) - 1];
  if (d.dia === -1) return `último dia de ${mes}`;
  if (d.dia !== null) return `${d.dia} de ${mes}`;
  return `${ordinal(d.ordem ?? 1, d.dia_semana ?? 0)} ${DIAS[d.dia_semana ?? 0].replace("-feira", "")} de ${mes}`;
}

const anosEntre = (de: string, ate: string) => Array.from({ length: Number(ate.slice(0, 4)) - Number(de.slice(0, 4)) + 1 }, (_, i) => Number(de.slice(0, 4)) + i);

/** Datas comemorativas entre as datas (inclusive), em ordem. */
export function comemoracoes(datas: DataComemorativa[], de: string, ate: string): Comemoracao[] {
  const r: Comemoracao[] = [];
  for (const ano of anosEntre(de, ate))
    for (const d of datas) {
      const data = dataNoAno(d, ano);
      if (data && data >= de && data <= ate) r.push({ data, id: d.id, nome: d.nome, descricao: d.descricao ?? null });
    }
  return r.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
}

/** Aniversários entre as datas (inclusive). Quem nasceu em 29/02 faz em 28/02 nos anos comuns. */
export function aniversarios(pacientes: { id: string; nome: string; nascimento: string | null }[], de: string, ate: string): Aniversario[] {
  const r: Aniversario[] = [];
  for (const ano of anosEntre(de, ate))
    for (const p of pacientes) {
      if (!p.nascimento) continue;
      const [anoNasc, mes, dia] = p.nascimento.split("-").map(Number);
      if (anoNasc >= ano) continue;
      const data = iso(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
      if (data >= de && data <= ate) r.push({ data, pacienteId: p.id, nome: p.nome, idade: ano - anoNasc });
    }
  return r.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
}
