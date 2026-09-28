import { describe, expect, it } from "vitest";
import { MAXIMO_DE_SESSOES, datasDaSerie, datasSemBloqueios, descricaoMensal, ordemNoMes } from "./recorrencia";

describe("datasDaSerie — semanal e quinzenal", () => {
  it("semanal por número de sessões", () => {
    expect(datasDaSerie("2026-09-29", "semanal", { tipo: "sessoes", quantidade: 4 })).toEqual([
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
      "2026-10-20",
    ]);
  });

  it("semanal até uma data (inclusive)", () => {
    expect(datasDaSerie("2026-09-29", "semanal", { tipo: "data", ate: "2026-10-13" })).toEqual([
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
    ]);
  });

  it("quinzenal pula uma semana", () => {
    expect(datasDaSerie("2026-09-29", "quinzenal", { tipo: "sessoes", quantidade: 3 })).toEqual([
      "2026-09-29",
      "2026-10-13",
      "2026-10-27",
    ]);
  });

  it("data final antes do início não gera nenhuma data", () => {
    expect(datasDaSerie("2026-09-29", "semanal", { tipo: "data", ate: "2026-09-01" })).toEqual([]);
  });

  it("respeita o máximo de sessões", () => {
    expect(datasDaSerie("2026-01-05", "semanal", { tipo: "data", ate: "2030-01-01" })).toHaveLength(MAXIMO_DE_SESSOES);
    expect(datasDaSerie("2026-01-05", "semanal", { tipo: "sessoes", quantidade: 500 })).toHaveLength(MAXIMO_DE_SESSOES);
  });
});

describe("datasDaSerie — mensal (mesmo dia da semana)", () => {
  it("mantém a ordem no mês: 3ª terça", () => {
    // 15/09/2026 é a 3ª terça de setembro.
    expect(datasDaSerie("2026-09-15", "mensal", { tipo: "sessoes", quantidade: 3 })).toEqual([
      "2026-09-15",
      "2026-10-20",
      "2026-11-17",
    ]);
  });

  it("vira o ano", () => {
    expect(datasDaSerie("2026-11-17", "mensal", { tipo: "sessoes", quantidade: 3 })).toEqual([
      "2026-11-17",
      "2026-12-15",
      "2027-01-19",
    ]);
  });

  it("pula meses sem a 5ª ocorrência", () => {
    // 29/09/2026 é a 5ª terça; outubro não tem 5ª terça, dezembro tem (29/12).
    expect(datasDaSerie("2026-09-29", "mensal", { tipo: "sessoes", quantidade: 2 })).toEqual(["2026-09-29", "2026-12-29"]);
  });

  it("para na data final", () => {
    expect(datasDaSerie("2026-09-15", "mensal", { tipo: "data", ate: "2026-11-01" })).toEqual(["2026-09-15", "2026-10-20"]);
  });
});

describe("descrições", () => {
  it("ordem e descrição da regra mensal", () => {
    expect(ordemNoMes("2026-09-15")).toBe(3);
    expect(descricaoMensal("2026-09-15")).toBe("3ª terça do mês");
    expect(descricaoMensal("2026-09-01")).toBe("1ª terça do mês");
  });
});

describe("datasSemBloqueios", () => {
  const natal = (d: string) => d === "2026-12-22";

  it("por data: só remove os dias bloqueados", () => {
    expect(datasSemBloqueios("2026-12-08", "semanal", { tipo: "data", ate: "2026-12-29" }, natal)).toEqual([
      "2026-12-08",
      "2026-12-15",
      "2026-12-29",
    ]);
  });

  it("por sessões: mantém a quantidade, repondo no fim", () => {
    expect(datasSemBloqueios("2026-12-08", "semanal", { tipo: "sessoes", quantidade: 4 }, natal)).toEqual([
      "2026-12-08",
      "2026-12-15",
      "2026-12-29",
      "2027-01-05",
    ]);
  });
});
