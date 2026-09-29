import { describe, expect, it } from "vitest";
import { lerValor, valorSugerido } from "./valores";

describe("lerValor", () => {
  it("aceita vírgula, milhar e R$", () => {
    expect(lerValor("150,50")).toBe(150.5);
    expect(lerValor("R$ 1.234,56")).toBe(1234.56);
    expect(lerValor("")).toBeNull();
    expect(lerValor("abc")).toBeNaN();
  });
});

describe("valorSugerido", () => {
  const plano = { valor_padrao: 120, valor_fonoaudiologia: 150, valor_psicologia: null, valor_nutricao: 0, valor_psicopedagogia: null };

  it("usa o valor da área do tipo", () => {
    expect(valorSugerido(plano, "fonoaudiologia")).toBe(150);
    expect(valorSugerido(plano, "nutricao")).toBe(0); // zero é um valor, não "vazio"
  });

  it("sem valor da área, sem área ou área desconhecida: valor padrão", () => {
    expect(valorSugerido(plano, "psicologia")).toBe(120);
    expect(valorSugerido(plano, null)).toBe(120);
    expect(valorSugerido(plano, "outra")).toBe(120);
  });

  it("sem plano: nenhum valor", () => {
    expect(valorSugerido(null, "psicologia")).toBeNull();
  });
});
