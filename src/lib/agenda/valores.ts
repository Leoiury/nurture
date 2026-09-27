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
