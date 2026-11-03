// Conversão de valores em reais digitados pelo usuário.

/**
 * "150", "150,50", "1.234,56", "R$ 80" ou "150.5" → número; texto vazio → null;
 * inválido → NaN. Com vírgula, o ponto é separador de milhar; sem vírgula, é decimal.
 */
export function lerValor(texto: string): number | null {
  const t = texto.trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

// Valores do plano por área ---------------------------------------------------------

/** Área de um tipo de atendimento: diz qual valor do plano ele usa. */
export type Area = "fonoaudiologia" | "psicologia" | "nutricao" | "psicopedagogia";

export const AREAS: { valor: Area; rotulo: string }[] = [
  { valor: "fonoaudiologia", rotulo: "Fonoaudiologia" },
  { valor: "psicologia", rotulo: "Psicologia" },
  { valor: "nutricao", rotulo: "Nutrição" },
  { valor: "psicopedagogia", rotulo: "Psicopedagogia" },
];

export type ValoresDoPlano = {
  valor_padrao: number | null;
  valor_fonoaudiologia: number | null;
  valor_psicologia: number | null;
  valor_nutricao: number | null;
  valor_psicopedagogia: number | null;
};

/** O valor da área do tipo, se o plano tiver; senão, o valor padrão do plano. */
export function valorSugerido(plano: ValoresDoPlano | null | undefined, area: string | null | undefined): number | null {
  if (!plano) return null;
  const daArea = area && AREAS.some((a) => a.valor === area) ? plano[`valor_${area as Area}`] : null;
  return daArea ?? plano.valor_padrao;
}
