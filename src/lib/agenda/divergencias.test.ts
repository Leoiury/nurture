import { describe, expect, it } from "vitest";
import type { AtendimentoAgenda } from "./dados";
import { encontrarDivergencias, textosDasDivergencias } from "./divergencias";

const h = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));

function a(id: string, inicio: string, extra: Partial<AtendimentoAgenda> = {}): AtendimentoAgenda {
  return {
    id,
    profissionalIds: ["ana"],
    profissionalNomes: ["Ana"],
    data: "2026-10-05",
    inicio: h(inicio),
    fim: h(inicio) + 45,
    status: "marcado",
    paciente: `Paciente ${id}`,
    plano: null,
    tipo: null,
    recorrenciaId: null,
    pacienteId: `p-${id}`,
    importado: false,
    tipoId: null,
    area: null,
    ...extra,
  };
}

describe("encontrarDivergencias", () => {
  it("sobreposição entre importado e do app", () => {
    const r = encontrarDivergencias([a("i", "09:00", { importado: true }), a("x", "09:30")]);
    expect(r).toEqual([{ coluna: "2026-10-05|ana", importado: "i", doApp: "x", tipo: "sobreposicao" }]);
  });

  it("mesmo paciente em horários diferentes no mesmo dia", () => {
    const r = encontrarDivergencias([a("i", "09:00", { importado: true, pacienteId: "joao" }), a("x", "14:00", { pacienteId: "joao" })]);
    expect(r.map((d) => d.tipo)).toEqual(["horario"]);
  });

  it("não é divergência: dois do mesmo sistema, desmarcado, outro dia ou outro profissional", () => {
    expect(encontrarDivergencias([a("x", "09:00"), a("y", "09:15")])).toEqual([]);
    expect(encontrarDivergencias([a("i", "09:00", { importado: true }), a("x", "09:15", { status: "desmarcado" })])).toEqual([]);
    expect(encontrarDivergencias([a("i", "09:00", { importado: true, pacienteId: "joao" }), a("x", "14:00", { pacienteId: "joao", data: "2026-10-06" })])).toEqual([]);
    expect(encontrarDivergencias([a("i", "09:00", { importado: true }), a("x", "09:15", { profissionalIds: ["bia"] })])).toEqual([]);
  });

  it("texto para os cards", () => {
    const lista = [a("i", "09:00", { importado: true, pacienteId: "joao" }), a("x", "14:00", { pacienteId: "joao" })];
    const t = textosDasDivergencias(encontrarDivergencias(lista), new Map(lista.map((x) => [x.id, x])));
    expect(t.get("i")).toBe("Divergência: no app, este paciente está às 14:00");
    expect(t.get("x")).toBe("Divergência: no sistema anterior, este paciente está às 09:00");
  });
});
