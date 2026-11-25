import { describe, expect, it } from "vitest";
import { fimDaCopia } from "./copiar";

describe("fimDaCopia", () => {
  it("série por número de sessões: mantém o número", () => {
    expect(fimDaCopia({ frequencia: "semanal", dataInicio: "2026-11-02", dataFim: null, sessoes: 10 }, "2026-12-07")).toEqual({ tipo: "sessoes", quantidade: 10 });
  });

  it("série até uma data: a data final anda junto com o início", () => {
    expect(fimDaCopia({ frequencia: "semanal", dataInicio: "2026-11-02", dataFim: "2026-11-30", sessoes: null }, "2026-11-04")).toEqual({ tipo: "data", ate: "2026-12-02" });
    // Colada antes do início original, também desloca (para trás).
    expect(fimDaCopia({ frequencia: "quinzenal", dataInicio: "2026-11-16", dataFim: "2026-12-28", sessoes: null }, "2026-11-09")).toEqual({ tipo: "data", ate: "2026-12-21" });
  });
});
