import { describe, expect, it } from "vitest";
import type { AtendimentoAgenda } from "./dados";
import { conflitosDoPaciente, registroPendente, separarCalendarioPessoal } from "./pessoal";

const AGORA = { data: "2026-11-04", minutos: 10 * 60 };

function atendimento(campos: Partial<AtendimentoAgenda>): AtendimentoAgenda {
  return {
    id: "a",
    profissionalIds: ["eu"],
    profissionalNomes: ["Eu"],
    data: "2026-11-04",
    inicio: 8 * 60,
    fim: 9 * 60,
    status: "marcado",
    paciente: "Paciente",
    plano: null,
    tipo: null,
    recorrenciaId: null,
    pacienteId: "p1",
    tipoId: null,
    area: null,
    importado: false,
    ...campos,
  };
}

describe("registroPendente", () => {
  it("marca o que já terminou como marcado ou confirmado", () => {
    expect(registroPendente(atendimento({}), AGORA)).toBe(true);
    expect(registroPendente(atendimento({ status: "confirmado", data: "2026-11-03", inicio: 900, fim: 960 }), AGORA)).toBe(true);
  });

  it("vale a partir do minuto em que termina", () => {
    expect(registroPendente(atendimento({ fim: 10 * 60 }), AGORA)).toBe(true);
    expect(registroPendente(atendimento({ fim: 10 * 60 + 1 }), AGORA)).toBe(false);
  });

  it("ignora o futuro e os status já registrados", () => {
    expect(registroPendente(atendimento({ data: "2026-11-05" }), AGORA)).toBe(false);
    for (const status of ["atendido", "faltou", "desmarcado"] as const) expect(registroPendente(atendimento({ status }), AGORA)).toBe(false);
  });
});

describe("separarCalendarioPessoal", () => {
  it("separa os meus (conjuntos inclusive) dos horários dos meus pacientes com outros", () => {
    const lista = [
      atendimento({ id: "meu" }),
      atendimento({ id: "conjunto", profissionalIds: ["eu", "ela"], pacienteId: "p2", data: "2026-11-05" }),
      atendimento({ id: "outro", profissionalIds: ["ela"], profissionalNomes: ["Ela"], inicio: 600, fim: 645 }),
      atendimento({ id: "desmarcado", profissionalIds: ["ela"], status: "desmarcado" }),
      atendimento({ id: "de-outro-paciente", profissionalIds: ["ela"], pacienteId: "p3" }),
    ];
    const { meus, outros } = separarCalendarioPessoal(lista, "eu", AGORA);
    expect(meus.map((a) => a.id)).toEqual(["meu", "conjunto"]);
    expect(meus[0].pendente).toBe(true);
    expect(meus[1].pendente).toBeUndefined();
    expect(outros).toEqual([{ pacienteId: "p1", data: "2026-11-04", inicio: 600, fim: 645, profissionais: ["Ela"] }]);
  });
});

describe("conflitosDoPaciente", () => {
  const outros = [{ pacienteId: "p1", data: "2026-11-04", inicio: 600, fim: 645, profissionais: ["Ela"] }];

  it("acusa só a mesma data, o mesmo paciente e horários que se cruzam", () => {
    expect(conflitosDoPaciente(outros, "p1", "2026-11-04", 630, 675)).toHaveLength(1);
    expect(conflitosDoPaciente(outros, "p2", "2026-11-04", 630, 675)).toHaveLength(0);
    expect(conflitosDoPaciente(outros, "p1", "2026-11-05", 630, 675)).toHaveLength(0);
  });

  it("horários colados não são conflito", () => {
    expect(conflitosDoPaciente(outros, "p1", "2026-11-04", 645, 690)).toHaveLength(0);
    expect(conflitosDoPaciente(outros, "p1", "2026-11-04", 555, 600)).toHaveLength(0);
  });
});
