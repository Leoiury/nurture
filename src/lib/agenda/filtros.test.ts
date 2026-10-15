import { describe, expect, it } from "vitest";
import type { AtendimentoAgenda } from "./dados";
import { FILTROS_VAZIOS, ajustarAoFiltro, aplicarFiltros, passaNoFiltro, quantosFiltros, type Filtros } from "./filtros";

function a(id: string, extra: Partial<AtendimentoAgenda> = {}): AtendimentoAgenda {
  return {
    id,
    profissionalIds: ["ana"],
    profissionalNomes: ["Ana"],
    data: "2026-10-14",
    inicio: 540,
    fim: 585,
    status: "marcado",
    paciente: `Paciente ${id}`,
    plano: { nome: "Unimed", cor: "#2E7D5B" },
    tipo: "Sessão Psicologia",
    recorrenciaId: null,
    pacienteId: `p-${id}`,
    importado: false,
    tipoId: null,
    area: null,
    ...extra,
  };
}

const com = (f: Partial<Filtros>): Filtros => ({ ...FILTROS_VAZIOS, ...f });

describe("filtros avançados", () => {
  it("sem filtros, todos passam", () => {
    expect(quantosFiltros(FILTROS_VAZIOS)).toBe(0);
    expect(aplicarFiltros([a("1")], FILTROS_VAZIOS, "esconder")).toHaveLength(1);
  });

  it("no mesmo grupo soma; entre grupos, valem juntos", () => {
    const f = com({ pacientes: [{ id: "p-1", nome: "" }, { id: "p-2", nome: "" }], status: ["confirmado"] });
    expect(quantosFiltros(f)).toBe(2);
    expect(passaNoFiltro(a("1", { status: "confirmado" }), f)).toBe(true);
    expect(passaNoFiltro(a("2", { status: "confirmado" }), f)).toBe(true);
    expect(passaNoFiltro(a("2"), f)).toBe(false); // status marcado
    expect(passaNoFiltro(a("3", { status: "confirmado" }), f)).toBe(false); // outro paciente
  });

  it("sem plano, sem tipo e sem guia contam como opção", () => {
    expect(passaNoFiltro(a("1", { plano: null }), com({ planos: [""] }))).toBe(true);
    expect(passaNoFiltro(a("1", { tipo: null }), com({ tipos: [""] }))).toBe(true);
    expect(passaNoFiltro(a("1"), com({ guias: ["sem"] }))).toBe(true);
    expect(passaNoFiltro(a("1", { guia: "vencendo" }), com({ guias: ["sem", "falta"] }))).toBe(false);
  });

  it("série ou avulso e cadastro do paciente", () => {
    expect(passaNoFiltro(a("1", { recorrenciaId: "r" }), com({ serie: "serie" }))).toBe(true);
    expect(passaNoFiltro(a("1"), com({ serie: "serie" }))).toBe(false);
    expect(passaNoFiltro(a("1"), com({ serie: "avulso" }))).toBe(true);
    expect(passaNoFiltro(a("1", { nivelCadastral: "critico" }), com({ cadastro: ["critico", "falta_informacao"] }))).toBe(true);
    expect(passaNoFiltro(a("1"), com({ cadastro: ["critico"] }))).toBe(false); // sem paciente cadastrado
  });

  it("esmaecer marca; esconder tira", () => {
    const f = com({ status: ["atendido"] });
    const lista = [a("1"), a("2", { status: "atendido" })];
    expect(aplicarFiltros(lista, f, "esmaecer").map((x) => !!x.esmaecido)).toEqual([true, false]);
    expect(aplicarFiltros(lista, f, "esconder").map((x) => x.id)).toEqual(["2"]);
  });
});

describe("ajustarAoFiltro", () => {
  it("tira colunas sem resultado e esmaecidos fora das horas usadas", () => {
    const lista = [
      a("ok", { profissionalIds: ["ana"], inicio: 540, fim: 585 }), // 09:00–09:45
      a("junto", { profissionalIds: ["ana"], inicio: 555, fim: 600, esmaecido: true }), // mesma hora: fica
      a("tarde", { profissionalIds: ["ana"], inicio: 900, fim: 945, esmaecido: true }), // 15:00: sai
      a("bia", { profissionalIds: ["bia"], inicio: 540, fim: 585, esmaecido: true }), // coluna sem resultado
    ];
    const r = ajustarAoFiltro(lista, ["ana", "bia", "caio"]);
    expect(r.profissionalIds).toEqual(["ana"]);
    expect(r.lista.map((x) => x.id)).toEqual(["ok", "junto"]);
  });

  it("nada combinando: não mexe", () => {
    const lista = [a("x", { esmaecido: true })];
    expect(ajustarAoFiltro(lista, ["ana", "bia"])).toEqual({ lista, profissionalIds: ["ana", "bia"] });
  });
});
