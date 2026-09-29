import { describe, expect, it } from "vitest";
import { horariosLivres, type Ocupacao } from "./horarios-livres";

const h = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const horas = (lista: { inicio: number }[]) =>
  lista.map((x) => `${String(Math.floor(x.inicio / 60)).padStart(2, "0")}:${String(x.inicio % 60).padStart(2, "0")}`);

describe("horariosLivres", () => {
  const dia = "2026-10-01";

  it("dia vazio: sequência de horários no expediente, pulando o almoço", () => {
    const r = horariosLivres({ dias: [dia], duracao: 60, grupos: [["ana"]], ocupacao: new Map(), limitePorPeriodo: 20 });
    expect(horas(r)).toEqual(["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
  });

  it("evita atendimentos existentes e retoma no próximo múltiplo de 15 min", () => {
    const ocupacao = new Map<string, Ocupacao[]>([["ana", [{ data: dia, inicio: h("08:30"), fim: h("09:15") }]]]);
    const r = horariosLivres({ dias: [dia], duracao: 45, grupos: [["ana"]], ocupacao, expedienteDo: () => [{ inicio: h("08:00"), fim: h("11:00") }] });
    expect(horas(r)).toEqual(["09:15", "10:00"]);
  });

  it("com dois profissionais juntos, só onde os dois estão livres", () => {
    const ocupacao = new Map<string, Ocupacao[]>([
      ["ana", [{ data: dia, inicio: h("08:00"), fim: h("09:00") }]],
      ["bruno", [{ data: dia, inicio: h("09:00"), fim: h("10:00") }]],
    ]);
    const r = horariosLivres({ dias: [dia], duracao: 60, grupos: [["ana", "bruno"]], ocupacao, expedienteDo: () => [{ inicio: h("08:00"), fim: h("12:00") }] });
    expect(horas(r)).toEqual(["10:00", "11:00"]);
  });

  it("alternativas (grupos separados) e o paciente ocupado valem para todos", () => {
    const ocupacao = new Map<string, Ocupacao[]>([["ana", [{ data: dia, inicio: h("08:00"), fim: h("09:00") }]]]);
    const r = horariosLivres({
      dias: [dia],
      duracao: 60,
      grupos: [["ana"], ["bruno"]],
      ocupacao,
      ocupacaoDoPaciente: [{ data: dia, inicio: h("10:00"), fim: h("11:00") }],
      expedienteDo: () => [{ inicio: h("08:00"), fim: h("11:00") }],
    });
    expect(r.map((x) => `${horas([x])[0]} ${x.profissionalIds[0]}`)).toEqual(["08:00 bruno", "09:00 ana", "09:00 bruno"]);
  });

  it("não sugere horários que já passaram", () => {
    const r = horariosLivres({
      dias: [dia, "2026-10-02"],
      duracao: 60,
      grupos: [["ana"]],
      ocupacao: new Map(),
      agora: { data: dia, minutos: h("16:10") },
      limitePorPeriodo: 2,
    });
    expect(r.map((x) => `${x.data} ${horas([x])[0]}`)).toEqual([
      "2026-10-01 16:15",
      "2026-10-02 08:00",
      "2026-10-02 09:00",
      "2026-10-02 13:00",
      "2026-10-02 14:00",
    ]);
  });

  it("respeita a escala de cada profissional do grupo", () => {
    const r = horariosLivres({
      dias: [dia],
      duracao: 60,
      grupos: [["estagiaria"]],
      ocupacao: new Map(),
      limitePorPeriodo: 10,
      expedienteDo: () => [{ inicio: h("13:00"), fim: h("16:00") }],
    });
    expect(horas(r)).toEqual(["13:00", "14:00", "15:00"]);
  });

  it("turno contínuo (sem almoço): o limite da manhã não impede a tarde", () => {
    const r = horariosLivres({
      dias: [dia],
      duracao: 60,
      grupos: [["ana"]],
      ocupacao: new Map(),
      limitePorPeriodo: 1,
      expedienteDo: () => [{ inicio: h("08:00"), fim: h("18:00") }],
    });
    expect(horas(r)).toEqual(["08:00", "12:00"]);
  });

  it("o limite vale por período: a tarde aparece mesmo com a manhã livre", () => {
    const r = horariosLivres({ dias: [dia], duracao: 30, grupos: [["ana"]], ocupacao: new Map(), limitePorPeriodo: 1 });
    expect(horas(r)).toEqual(["08:00", "13:00"]);
  });
});
