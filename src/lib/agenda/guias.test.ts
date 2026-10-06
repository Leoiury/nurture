import { describe, expect, it } from "vitest";
import { candidatasDeContinuacao, frequenciaEntre, proximasDatas, situacaoDaGuia } from "./guias";

describe("situacaoDaGuia", () => {
  const guia = (posicao: number, renovada = false) => ({ posicao, quantidade: 10, renovada });

  it("verde com guia; amarelo nos 3 últimos de uma guia não renovada", () => {
    expect(situacaoDaGuia(guia(1), false, "marcado")).toBe("ok");
    expect(situacaoDaGuia(guia(7), false, "marcado")).toBe("ok");
    expect(situacaoDaGuia(guia(8), false, "marcado")).toBe("vencendo");
    expect(situacaoDaGuia(guia(10), false, "atendido")).toBe("vencendo");
    expect(situacaoDaGuia(guia(10, true), false, "marcado")).toBe("ok");
  });

  it("vermelho sem guia num plano que exige; nada nos demais e nos desmarcados", () => {
    expect(situacaoDaGuia(null, true, "marcado")).toBe("falta");
    expect(situacaoDaGuia(null, false, "marcado")).toBeNull();
    expect(situacaoDaGuia(null, true, "desmarcado")).toBeNull();
  });
});

describe("proximasDatas", () => {
  const continuar = (ultima: string, f: "semanal" | "quinzenal" | "mensal", n: number, bloqueado: (d: string) => boolean = () => false, minimo = "2026-01-01") =>
    proximasDatas(candidatasDeContinuacao(ultima, f, minimo), n, bloqueado);

  it("continua a série depois da última data, pulando feriados", () => {
    expect(continuar("2026-10-05", "semanal", 3)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(continuar("2026-10-05", "semanal", 2, (d) => d === "2026-10-12")).toEqual(["2026-10-19", "2026-10-26"]);
    expect(continuar("2026-10-05", "quinzenal", 1)).toEqual(["2026-10-19"]);
    expect(continuar("2026-10-05", "mensal", 2)).toEqual(["2026-11-02", "2026-12-07"]); // 1ª segunda
    expect(continuar("2026-10-05", "semanal", 0)).toEqual([]);
  });

  it("série antiga continua a partir de hoje, no mesmo dia da semana", () => {
    expect(continuar("2026-01-05", "semanal", 2, undefined, "2026-10-07")).toEqual(["2026-10-12", "2026-10-19"]);
    expect(continuar("2026-01-05", "quinzenal", 1, undefined, "2026-10-07")).toEqual(["2026-10-12"]);
    expect(continuar("2026-01-05", "mensal", 1, undefined, "2026-10-07")).toEqual(["2026-11-02"]);
  });
});

describe("frequenciaEntre", () => {
  it("pelo intervalo entre dois atendimentos", () => {
    expect(frequenciaEntre("2026-10-05", "2026-10-12")).toBe("semanal");
    expect(frequenciaEntre("2026-10-05", "2026-10-19")).toBe("quinzenal");
    expect(frequenciaEntre("2026-10-05", "2026-11-02")).toBe("mensal");
    expect(frequenciaEntre("2026-10-05", "2026-10-06")).toBe("semanal");
  });
});
