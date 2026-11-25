// Copiar e colar atendimentos: o colado repete a série inteira do copiado (mesma
// frequência e o mesmo número de sessões, ou a mesma duração se termina numa data),
// começando no dia escolhido.

import type { FimDaSerie, Frequencia } from "./recorrencia";
import { somarDias } from "./tempo";

export type RegraDaSerie = { frequencia: Frequencia; dataInicio: string; dataFim: string | null; sessoes: number | null };

/** Dias entre duas datas AAAA-MM-DD (b − a). */
function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Fim da série colada em `novaData`: o mesmo número de sessões, ou a data final deslocada. */
export function fimDaCopia(regra: RegraDaSerie, novaData: string): FimDaSerie {
  if (regra.sessoes !== null) return { tipo: "sessoes", quantidade: regra.sessoes };
  return { tipo: "data", ate: somarDias(regra.dataFim ?? regra.dataInicio, diasEntre(regra.dataInicio, novaData)) };
}
