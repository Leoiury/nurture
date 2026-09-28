import { describe, expect, it } from "vitest";
import { formatarCpf, idade, paraBusca } from "./pacientes";

describe("paraBusca", () => {
  it("ignora acentos, maiúsculas e espaços nas pontas", () => {
    expect(paraBusca("  João Conceição ")).toBe("joao conceicao");
    expect(paraBusca("ÁGUEDA")).toBe("agueda");
  });
});

describe("idade", () => {
  const ref = new Date(2026, 8, 28); // 28/09/2026
  it("anos e meses", () => {
    expect(idade("2019-01-30", ref)).toBe("7 anos e 7 meses");
    expect(idade("2014-09-28", ref)).toBe("12 anos");
  });
  it("antes do aniversário do mês", () => {
    expect(idade("2020-09-29", ref)).toBe("5 anos e 11 meses");
  });
  it("bebês em meses", () => {
    expect(idade("2026-01-15", ref)).toBe("8 meses");
    expect(idade("2025-10-10", ref)).toBe("11 meses");
  });
});

describe("formatarCpf", () => {
  it("formata 11 dígitos e mantém o resto", () => {
    expect(formatarCpf("12345678901")).toBe("123.456.789-01");
    expect(formatarCpf("123")).toBe("123");
  });
});
