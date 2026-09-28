import { describe, expect, it } from "vitest";
import { horariosLivres, profissionaisCompativeis, type Ocupacao } from "./horarios-livres";

const h = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const horas = (lista: { inicio: number }[]) =>
  lista.map((x) => `${String(Math.floor(x.inicio / 60)).padStart(2, "0")}:${String(x.inicio % 60).padStart(2, "0")}`);

describe("horariosLivres", () => {
  const dia = "2026-10-01";

  it("dia vazio: sequência de horários no expediente, pulando o almoço", () => {
    const r = horariosLivres({ dias: [dia], duracao: 60, grupos: [["ana"]], ocupacao: new Map(), limitePorDia: 20 });
    expect(horas(r)).toEqual(["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
  });

  it("evita atendimentos existentes e retoma no próximo múltiplo de 15 min", () => {
    const ocupacao = new Map<string, Ocupacao[]>([["ana", [{ data: dia, inicio: h("08:30"), fim: h("09:15") }]]]);
    const r = horariosLivres({ dias: [dia], duracao: 45, grupos: [["ana"]], ocupacao, expediente: [{ inicio: h("08:00"), fim: h("11:00") }] });
    expect(horas(r)).toEqual(["09:15", "10:00"]);
  });

  it("com dois profissionais juntos, só onde os dois estão livres", () => {
    const ocupacao = new Map<string, Ocupacao[]>([
      ["ana", [{ data: dia, inicio: h("08:00"), fim: h("09:00") }]],
      ["bruno", [{ data: dia, inicio: h("09:00"), fim: h("10:00") }]],
    ]);
    const r = horariosLivres({ dias: [dia], duracao: 60, grupos: [["ana", "bruno"]], ocupacao, expediente: [{ inicio: h("08:00"), fim: h("12:00") }] });
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
      expediente: [{ inicio: h("08:00"), fim: h("11:00") }],
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
      limitePorDia: 3,
    });
    expect(r.map((x) => `${x.data} ${horas([x])[0]}`)).toEqual(["2026-10-01 16:15", "2026-10-02 08:00", "2026-10-02 09:00", "2026-10-02 10:00"]);
  });
});

describe("profissionaisCompativeis", () => {
  const profs = [
    { id: "1", especialidade: "Psicóloga" },
    { id: "2", especialidade: "Fonoaudióloga" },
    { id: "3", especialidade: "Estagiária de Fono" },
    { id: "4", especialidade: "Neuropsicopedagoga" },
    { id: "5", especialidade: null },
  ];
  const ids = (tipo: string | null) => profissionaisCompativeis(tipo, profs).map((p) => p.id);

  it("filtra pela especialidade do tipo", () => {
    expect(ids("Sessão Fonoaudiologia")).toEqual(["2", "3"]);
    expect(ids("Sessão Psicologia")).toEqual(["1"]); // neuropsicopedagoga não entra
    expect(ids("Sessão ABA")).toEqual(["1"]);
    expect(ids("Atendimento Pedagógico")).toEqual(["4"]);
  });

  it("tipo sem regra conhecida ou vazio: todos", () => {
    expect(ids("Reunião")).toHaveLength(5);
    expect(ids(null)).toHaveLength(5);
  });
});
