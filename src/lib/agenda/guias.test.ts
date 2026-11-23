import { describe, expect, it } from "vitest";
import { situacaoDaGuia } from "./guias";

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
