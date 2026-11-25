import { describe, expect, it } from "vitest";
import { ajustarMinuto, moverNaColuna, primeiroMinuto } from "./cursor";

// 08:00–12:00 aberto, 12:00–13:00 compactado, 13:00–18:00 aberto.
const segmentos = [
  { inicio: 480, fim: 720, compacto: false },
  { inicio: 720, fim: 780, compacto: true },
  { inicio: 780, fim: 1080, compacto: false },
];

describe("cursor da grade", () => {
  it("anda de 15 em 15 minutos", () => {
    expect(moverNaColuna(540, segmentos, 1)).toBe(555);
    expect(moverNaColuna(540, segmentos, -1)).toBe(525);
  });

  it("pula a faixa compactada nos dois sentidos", () => {
    expect(moverNaColuna(705, segmentos, 1)).toBe(780);
    expect(moverNaColuna(780, segmentos, -1)).toBe(705);
  });

  it("para nos limites da coluna", () => {
    expect(moverNaColuna(480, segmentos, -1)).toBe(480);
    expect(moverNaColuna(1065, segmentos, 1)).toBe(1065);
  });

  it("ajusta um minuto de outra coluna para um horário selecionável", () => {
    expect(primeiroMinuto(segmentos)).toBe(480);
    expect(ajustarMinuto(547, segmentos)).toBe(540);
    expect(ajustarMinuto(735, segmentos)).toBe(705); // dentro da faixa compactada: o mais próximo
    expect(ajustarMinuto(400, segmentos)).toBe(480);
  });
});
