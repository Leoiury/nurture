// Guias de autorização do convênio: situação no card e datas dos atendimentos
// que faltam para completar uma guia.

import { MAXIMO_DE_SESSOES, datasDaSerie, type Frequencia } from "./recorrencia";
import { diaDaSemana, somarDias } from "./tempo";

/**
 * ok: tem guia (verde). vencendo: um dos 3 últimos atendimentos de uma guia ainda
 * não renovada (amarelo). falta: o plano exige guia e o atendimento não tem (vermelho).
 */
export type SituacaoDaGuia = "ok" | "vencendo" | "falta";

/** Últimos atendimentos de uma guia que ganham o alerta de renovação. */
export const AVISO_DE_RENOVACAO = 3;

export type Cobertura = { posicao: number; quantidade: number; renovada: boolean };

export function situacaoDaGuia(cobertura: Cobertura | null, exigeGuia: boolean, status: string): SituacaoDaGuia | null {
  if (status === "desmarcado") return null; // desmarcado não gasta sessão
  if (cobertura) return !cobertura.renovada && cobertura.posicao > cobertura.quantidade - AVISO_DE_RENOVACAO ? "vencendo" : "ok";
  return exigeGuia ? "falta" : null;
}

export const ROTULO_SITUACAO: Record<SituacaoDaGuia, string> = {
  ok: "Guia em dia",
  vencendo: "Guia perto do fim",
  falta: "Sem guia",
};

/**
 * Datas candidatas para continuar a série depois de `ultima` (exclusive), na mesma
 * frequência e nunca antes de `minimo` (uma série antiga continua a partir de hoje).
 */
export function candidatasDeContinuacao(ultima: string, frequencia: Frequencia, minimo: string): string[] {
  let inicio = ultima;
  if (frequencia !== "mensal" && ultima < minimo) {
    // Avança em passos inteiros, mantendo o dia da semana.
    const passo = frequencia === "semanal" ? 7 : 14;
    const dias = Math.round((new Date(`${minimo}T12:00:00Z`).getTime() - new Date(`${ultima}T12:00:00Z`).getTime()) / 86_400_000);
    inicio = somarDias(ultima, Math.floor(dias / passo) * passo);
  }
  return datasDaSerie(inicio, frequencia, { tipo: "sessoes", quantidade: MAXIMO_DE_SESSOES }).filter((d) => d > ultima && d >= minimo);
}

/** As próximas `quantidade` datas da série, pulando os dias bloqueados (feriados e recessos). */
export function proximasDatas(candidatas: string[], quantidade: number, bloqueado: (data: string) => boolean): string[] {
  if (quantidade <= 0) return [];
  return candidatas.filter((d) => !bloqueado(d)).slice(0, quantidade);
}

/** Frequência mais provável entre duas datas de atendimentos (padrão: semanal). */
export function frequenciaEntre(a: string, b: string): Frequencia {
  const dias = Math.abs(new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000;
  if (dias >= 13 && dias <= 15) return "quinzenal";
  if (dias >= 27 && dias <= 36 && diaDaSemana(a) === diaDaSemana(b)) return "mensal";
  return "semanal";
}
