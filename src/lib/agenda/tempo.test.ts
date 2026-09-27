import { describe, expect, it } from "vitest";
import {
  diaDaSemana,
  ehDataValida,
  formatarHora,
  inicioDaSemana,
  nomeDoMes,
  partesNoFuso,
  rotuloDaSemana,
  semanasDoMes,
  somarDias,
  somarMeses,
} from "./tempo";

describe("partesNoFuso", () => {
  it("converte o instante para data e minutos em São Paulo", () => {
    expect(partesNoFuso("2026-09-01T11:00:00.000Z")).toEqual({ data: "2026-09-01", minutos: 8 * 60 });
  });

  it("vira o dia corretamente perto da meia-noite UTC", () => {
    // 01:30 UTC do dia 2 ainda é 22:30 do dia 1 em São Paulo.
    expect(partesNoFuso("2026-09-02T01:30:00.000Z")).toEqual({ data: "2026-09-01", minutos: 22 * 60 + 30 });
  });
});

describe("aritmética de calendário", () => {
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("encontra a segunda-feira da semana", () => {
    expect(inicioDaSemana("2026-09-21")).toBe("2026-09-21"); // segunda
    expect(inicioDaSemana("2026-09-27")).toBe("2026-09-21"); // domingo
    expect(inicioDaSemana("2026-10-01")).toBe("2026-09-28"); // quinta
  });

  it("identifica o dia da semana (0 = domingo)", () => {
    expect(diaDaSemana("2026-09-27")).toBe(0);
    expect(diaDaSemana("2026-09-21")).toBe(1);
  });

  it("soma meses a partir do primeiro dia", () => {
    expect(somarMeses("2026-09-15", 1)).toBe("2026-10-01");
    expect(somarMeses("2026-01-31", -1)).toBe("2025-12-01");
  });
});

describe("semanasDoMes", () => {
  it("lista as semanas com ao menos um dia útil no mês", () => {
    expect(semanasDoMes("2026-09-15")).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("ignora a semana cujo único dia do mês é fim de semana", () => {
    // Novembro de 2026 começa num domingo: a semana de 26/10 não entra.
    expect(semanasDoMes("2026-11-10")[0]).toBe("2026-11-02");
  });
});

describe("formatação", () => {
  it("formata horas", () => {
    expect(formatarHora(8 * 60)).toBe("08:00");
    expect(formatarHora(13 * 60 + 5)).toBe("13:05");
  });

  it("nomeia o mês em português", () => {
    expect(nomeDoMes("2026-09-15")).toBe("Setembro de 2026");
  });

  it("rotula a semana de segunda a sexta", () => {
    expect(rotuloDaSemana("2026-09-21")).toBe("21–25 set");
    expect(rotuloDaSemana("2026-09-28")).toBe("28 set–2 out");
  });

  it("valida datas AAAA-MM-DD", () => {
    expect(ehDataValida("2026-09-21")).toBe(true);
    expect(ehDataValida("21/09/2026")).toBe(false);
    expect(ehDataValida(undefined)).toBe(false);
  });
});
