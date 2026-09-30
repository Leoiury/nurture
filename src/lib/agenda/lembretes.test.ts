import { describe, expect, it } from "vitest";
import { aniversarios, comemoracoes, dataNoAno, descreverRegra } from "./lembretes";

const fixa = (dia: number, mes: number) => ({ mes, dia, ordem: null, dia_semana: null, pascoa: null });
const daPascoa = (dias: number) => ({ mes: null, dia: null, ordem: null, dia_semana: null, pascoa: dias });
const movel = (ordem: number, dia_semana: number, mes: number) => ({ mes, dia: null, ordem, dia_semana, pascoa: null });

describe("dataNoAno", () => {
  it("datas fixas", () => {
    expect(dataNoAno(fixa(12, 10), 2026)).toBe("2026-10-12");
    expect(dataNoAno(fixa(31, 4), 2026)).toBeNull(); // abril não tem 31
    expect(dataNoAno(fixa(-1, 2), 2026)).toBe("2026-02-28"); // último dia de fevereiro
    expect(dataNoAno(fixa(-1, 2), 2028)).toBe("2028-02-29");
  });
  it("em relação à Páscoa", () => {
    expect(dataNoAno(daPascoa(-47), 2026)).toBe("2026-02-17"); // Carnaval 2026
    expect(dataNoAno(daPascoa(-47), 2027)).toBe("2027-02-09");
    expect(descreverRegra(daPascoa(-47))).toBe("47 dias antes da Páscoa");
    expect(descreverRegra(fixa(-1, 2))).toBe("último dia de fevereiro");
  });
  it("datas móveis", () => {
    expect(dataNoAno(movel(2, 0, 5), 2026)).toBe("2026-05-10"); // Dia das Mães 2026
    expect(dataNoAno(movel(2, 0, 8), 2026)).toBe("2026-08-09"); // Dia dos Pais 2026
    expect(dataNoAno(movel(-1, 5, 10), 2026)).toBe("2026-10-30"); // última sexta de outubro
    expect(dataNoAno(movel(5, 1, 2), 2026)).toBeNull(); // não há 5ª segunda em fev/2026
  });
  it("descrição", () => {
    expect(descreverRegra(fixa(12, 10))).toBe("12 de outubro");
    expect(descreverRegra(movel(2, 0, 5))).toBe("2º domingo de maio");
    expect(descreverRegra(movel(-1, 5, 10))).toBe("última sexta de outubro");
    expect(descreverRegra(movel(1, 1, 3))).toBe("1ª segunda de março");
  });
});

describe("comemoracoes", () => {
  it("no período, inclusive virando o ano", () => {
    const datas = [
      { id: "c", nome: "Crianças", ...fixa(12, 10) },
      { id: "n", nome: "Natal", ...fixa(25, 12) },
      { id: "a", nome: "Ano Novo", ...fixa(1, 1) },
    ];
    expect(comemoracoes(datas, "2026-12-20", "2027-01-03").map((c) => `${c.data} ${c.nome}`)).toEqual(["2026-12-25 Natal", "2027-01-01 Ano Novo"]);
    expect(comemoracoes(datas, "2026-09-30", "2026-10-14")).toEqual([{ data: "2026-10-12", id: "c", nome: "Crianças", descricao: null }]);
  });
});

describe("aniversarios", () => {
  const pacientes = [
    { id: "1", nome: "Ana", nascimento: "2018-10-05" },
    { id: "2", nome: "Bia", nascimento: "2016-02-29" },
    { id: "3", nome: "Caio", nascimento: null },
    { id: "4", nome: "Duda", nascimento: "2020-12-31" },
  ];
  it("no período, com a idade que vai fazer", () => {
    expect(aniversarios(pacientes, "2026-09-30", "2026-10-14")).toEqual([{ data: "2026-10-05", pacienteId: "1", nome: "Ana", idade: 8 }]);
  });
  it("29/02 vira 28/02 em ano comum; período que vira o ano", () => {
    expect(aniversarios(pacientes, "2027-02-20", "2027-03-01").map((a) => [a.data, a.nome, a.idade])).toEqual([["2027-02-28", "Bia", 11]]);
    expect(aniversarios(pacientes, "2026-12-25", "2027-01-05").map((a) => a.nome)).toEqual(["Duda"]);
  });
});
