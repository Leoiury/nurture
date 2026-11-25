// Guias de autorização do convênio: situação no card.

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

