import { describe, expect, it } from "vitest";
import { ALTURA_COMPACTA, distribuirEmFaixas, encaixar, minutosNaPosicao, montarSegmentos, posicaoY } from "./layout";

const expediente = { inicioPadrao: 8 * 60, fimPadrao: 18 * 60, expandidos: new Set<number>() };
const resumo = (segmentos: ReturnType<typeof montarSegmentos>) =>
  segmentos.map((s) => `${s.inicio / 60}-${s.fim / 60}${s.compacto ? "c" : ""}`).join(" ");

describe("montarSegmentos", () => {
  it("sem compactar, cria um segmento por hora do expediente", () => {
    expect(montarSegmentos([], { ...expediente, compactar: false })).toHaveLength(10);
  });

  it("junta horas vazias consecutivas num segmento compacto", () => {
    const segmentos = montarSegmentos(
      [
        { inicio: 8 * 60, fim: 8 * 60 + 30 },
        { inicio: 14 * 60, fim: 14 * 60 + 30 },
      ],
      { ...expediente, compactar: true },
    );
    expect(resumo(segmentos)).toBe("8-9 9-14c 14-15 15-18c");
  });

  it("mantém expandidas as horas escolhidas pelo usuário", () => {
    const segmentos = montarSegmentos([{ inicio: 8 * 60, fim: 9 * 60 }], {
      ...expediente,
      compactar: true,
      expandidos: new Set([12 * 60]),
    });
    expect(resumo(segmentos)).toBe("8-9 9-12c 12-13 13-18c");
  });

  it("estende o período para atendimentos fora do expediente", () => {
    const segmentos = montarSegmentos([{ inicio: 7 * 60 + 30, fim: 8 * 60 }], { ...expediente, compactar: false });
    expect(segmentos[0].inicio).toBe(7 * 60);
  });
});

describe("posicaoY", () => {
  const segmentos = montarSegmentos([{ inicio: 10 * 60 + 30, fim: 11 * 60 + 15 }], {
    inicioPadrao: 8 * 60,
    fimPadrao: 12 * 60,
    compactar: false,
    expandidos: new Set(),
  });

  it("posiciona proporcionalmente dentro da hora (12 px por 15 min)", () => {
    expect(posicaoY(10 * 60, segmentos, 12)).toBe(96);
    expect(posicaoY(10 * 60 + 30, segmentos, 12)).toBe(120);
    // 11:15 termina a 1/4 da distância entre 11:00 e 12:00.
    expect(posicaoY(11 * 60 + 15, segmentos, 12)).toBe(156);
  });

  it("conta segmentos compactos com altura fixa", () => {
    const comLacuna = montarSegmentos([{ inicio: 8 * 60, fim: 9 * 60 }, { inicio: 12 * 60, fim: 13 * 60 }], {
      ...expediente,
      fimPadrao: 13 * 60,
      compactar: true,
    });
    expect(posicaoY(12 * 60, comLacuna, 12)).toBe(48 + ALTURA_COMPACTA);
  });
});

describe("distribuirEmFaixas", () => {
  it("coloca atendimentos sobrepostos lado a lado", () => {
    expect(
      distribuirEmFaixas([
        { inicio: 600, fim: 645 },
        { inicio: 600, fim: 630 },
        { inicio: 630, fim: 675 },
        { inicio: 700, fim: 730 },
      ]),
    ).toEqual([
      { faixa: 0, faixas: 2 },
      { faixa: 1, faixas: 2 },
      { faixa: 1, faixas: 2 },
      { faixa: 0, faixas: 1 },
    ]);
  });

  it("atendimentos encostados (um termina quando o outro começa) não são paralelos", () => {
    expect(distribuirEmFaixas([{ inicio: 600, fim: 630 }, { inicio: 630, fim: 660 }])).toEqual([
      { faixa: 0, faixas: 1 },
      { faixa: 0, faixas: 1 },
    ]);
  });
});

describe("minutosNaPosicao", () => {
  const segmentos = montarSegmentos([{ inicio: 8 * 60, fim: 9 * 60 }, { inicio: 12 * 60, fim: 13 * 60 }], {
    ...expediente,
    fimPadrao: 13 * 60,
    compactar: true,
  });

  it("é o inverso de posicaoY", () => {
    expect(minutosNaPosicao(posicaoY(8 * 60 + 30, segmentos, 12), segmentos, 12)?.minutos).toBe(8 * 60 + 30);
    expect(encaixar(minutosNaPosicao(30, segmentos, 12)!.minutos)).toBe(8 * 60 + 30); // 30 px = 37,5 min → 08:30
  });

  it("identifica a faixa compacta", () => {
    expect(minutosNaPosicao(48 + 5, segmentos, 12)?.segmento.compacto).toBe(true);
  });

  it("fora da grade é null", () => {
    expect(minutosNaPosicao(-1, segmentos, 12)).toBeNull();
    expect(minutosNaPosicao(10_000, segmentos, 12)).toBeNull();
  });
});
