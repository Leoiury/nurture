// Datas da agenda. A clínica opera em America/Sao_Paulo, mas o servidor (Vercel)
// roda em UTC: por isso toda conversão passa explicitamente pelo fuso.
// Datas "de calendário" circulam como strings AAAA-MM-DD.

export const FUSO = "America/Sao_Paulo";

const formatoPartes = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Data (AAAA-MM-DD) e minutos desde 00:00 de um instante, no fuso da clínica. */
export function partesNoFuso(instante: string | Date): { data: string; minutos: number } {
  const p = Object.fromEntries(
    formatoPartes.formatToParts(new Date(instante)).map((x) => [x.type, x.value]),
  );
  return { data: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

export function hoje(): string {
  return partesNoFuso(new Date()).data;
}

export function ehDataValida(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

// Aritmética de calendário feita ao meio-dia UTC, longe de qualquer virada de dia.
function comoUTC(data: string): Date {
  return new Date(`${data}T12:00:00Z`);
}

export function somarDias(data: string, dias: number): string {
  const d = comoUTC(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(data: string): number {
  return comoUTC(data).getUTCDay();
}

/** Segunda-feira da semana que contém a data. */
export function inicioDaSemana(data: string): string {
  return somarDias(data, -((diaDaSemana(data) + 6) % 7));
}

export function inicioDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

export function somarMeses(data: string, meses: number): string {
  const d = comoUTC(inicioDoMes(data));
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/** Segundas-feiras das semanas que têm ao menos um dia útil no mês. */
export function semanasDoMes(data: string): string[] {
  const mes = data.slice(0, 7);
  const semanas: string[] = [];
  for (let seg = inicioDaSemana(inicioDoMes(data)); ; seg = somarDias(seg, 7)) {
    const uteis = [0, 1, 2, 3, 4].map((i) => somarDias(seg, i));
    if (uteis[0].slice(0, 7) > mes) break;
    if (uteis.some((d) => d.slice(0, 7) === mes)) semanas.push(seg);
  }
  return semanas;
}

/** Início do dia no fuso da clínica, como instante ISO (Brasil sem horário de verão: -03:00). */
export function inicioDoDiaISO(data: string): string {
  return `${data}T00:00:00-03:00`;
}

export function formatarHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const nomesMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const nomesMesCurto = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const nomesDia = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const nomesDiaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function nomeDoMes(data: string): string {
  const s = nomesMes.format(comoUTC(data));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "set", "out"… */
export function nomeCurtoDoMes(data: string): string {
  return nomesMesCurto.format(comoUTC(data)).replace(".", "");
}

/** "21–25 set", "29 set–3 out" (segunda a sexta) */
export function rotuloDaSemana(segunda: string): string {
  const sexta = somarDias(segunda, 4);
  return segunda.slice(5, 7) === sexta.slice(5, 7)
    ? `${diaDoMes(segunda)}–${diaDoMes(sexta)} ${nomeCurtoDoMes(sexta)}`
    : `${diaDoMes(segunda)} ${nomeCurtoDoMes(segunda)}–${diaDoMes(sexta)} ${nomeCurtoDoMes(sexta)}`;
}

/** "seg", "ter"… */
export function nomeCurtoDoDia(data: string): string {
  return nomesDia.format(comoUTC(data)).replace(".", "");
}

/** "segunda-feira, 21 de setembro" */
export function nomeLongoDoDia(data: string): string {
  return nomesDiaLongo.format(comoUTC(data));
}

export function diaDoMes(data: string): number {
  return Number(data.slice(8, 10));
}
