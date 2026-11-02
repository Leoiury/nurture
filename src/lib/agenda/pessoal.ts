// Calendário pessoal do profissional: os próprios atendimentos e, deles separados,
// os horários dos mesmos pacientes com outros profissionais (área cinza ao arrastar).

import type { AtendimentoAgenda } from "./dados";

export type OutroDoPaciente = { pacienteId: string; data: string; inicio: number; fim: number; profissionais: string[] };

type Agora = { data: string; minutos: number };

/** Já terminou e continua marcado ou confirmado: ninguém registrou se aconteceu. */
export function registroPendente(a: Pick<AtendimentoAgenda, "status" | "data" | "fim">, agora: Agora): boolean {
  if (a.status !== "marcado" && a.status !== "confirmado") return false;
  return a.data < agora.data || (a.data === agora.data && a.fim <= agora.minutos);
}

export function separarCalendarioPessoal(lista: AtendimentoAgenda[], profissionalId: string, agora: Agora): { meus: AtendimentoAgenda[]; outros: OutroDoPaciente[] } {
  const meus = lista.filter((a) => a.profissionalIds.includes(profissionalId));
  const pacientes = new Set(meus.map((a) => a.pacienteId));
  const outros: OutroDoPaciente[] = [];
  for (const a of lista) {
    if (a.profissionalIds.includes(profissionalId) || a.status === "desmarcado" || !a.pacienteId || !pacientes.has(a.pacienteId)) continue;
    outros.push({ pacienteId: a.pacienteId, data: a.data, inicio: a.inicio, fim: a.fim, profissionais: a.profissionalNomes });
  }
  return { meus: meus.map((a) => (registroPendente(a, agora) ? { ...a, pendente: true } : a)), outros };
}

/** Horários do paciente com outros profissionais que coincidem com este período. */
export function conflitosDoPaciente(outros: OutroDoPaciente[], pacienteId: string | null, data: string, inicio: number, fim: number): OutroDoPaciente[] {
  return outros.filter((o) => o.pacienteId === pacienteId && o.data === data && o.inicio < fim && o.fim > inicio);
}
