import { describe, expect, it } from "vitest";
import { diasEspeciais, feriadosNacionais, pascoa, semExpediente } from "./feriados";

describe("pascoa", () => {
  it("calcula o domingo de Páscoa", () => {
    expect(pascoa(2024)).toBe("2024-03-31");
    expect(pascoa(2025)).toBe("2025-04-20");
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
  });
});

describe("feriadosNacionais", () => {
  const f2026 = feriadosNacionais(2026);
  const em = (data: string) => f2026.filter((f) => f.data === data);

  it("inclui os fixos", () => {
    expect(em("2026-09-07")[0]).toMatchObject({ nome: "Independência do Brasil", tipo: "feriado" });
    expect(em("2026-11-20")[0].tipo).toBe("feriado");
    expect(em("2026-12-25")[0].nome).toBe("Natal");
  });

  it("calcula os móveis a partir da Páscoa (2026)", () => {
    expect(em("2026-02-16")[0]).toMatchObject({ nome: "Carnaval", tipo: "facultativo" });
    expect(em("2026-02-17")[0]).toMatchObject({ nome: "Carnaval", tipo: "facultativo" });
    expect(em("2026-04-03")[0]).toMatchObject({ nome: "Sexta-feira Santa", tipo: "feriado" });
    expect(em("2026-06-04")[0]).toMatchObject({ nome: "Corpus Christi", tipo: "facultativo" });
  });
});

describe("diasEspeciais", () => {
  it("combina nacionais e cadastrados no período, com o recesso primeiro", () => {
    const mapa = diasEspeciais("2026-12-20", "2027-01-05", [
      { nome: "Recesso de fim de ano", tipo: "recesso", data_inicio: "2026-12-22", data_fim: "2027-01-06" },
    ]);
    expect(mapa.get("2026-12-21")).toBeUndefined();
    expect(mapa.get("2026-12-22")?.[0]).toMatchObject({ tipo: "recesso", origem: "cadastro" });
    expect(mapa.get("2026-12-25")?.map((d) => d.tipo)).toEqual(["recesso", "feriado"]);
    expect(mapa.get("2027-01-01")?.map((d) => d.nome)).toContain("Confraternização Universal");
    // O recesso vai até 06/01, mas o período consultado termina em 05/01.
    expect(mapa.has("2027-01-06")).toBe(false);
  });

  it("feriado e recesso não têm expediente; ponto facultativo tem", () => {
    const mapa = diasEspeciais("2026-02-16", "2026-04-03", []);
    expect(semExpediente(mapa.get("2026-02-16"))).toBe(false); // Carnaval
    expect(semExpediente(mapa.get("2026-04-03"))).toBe(true); // Sexta-feira Santa
    expect(semExpediente(mapa.get("2026-03-10"))).toBe(false);
  });
});
