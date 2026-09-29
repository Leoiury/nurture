import { describe, expect, it } from "vitest";
import { atendeOTipo, profissionaisDoTipo, tipoSugerido } from "./tipos";

const tipos = [
  { id: "aba", nome: "Sessão ABA", profissionais: ["psi"] },
  { id: "fono", nome: "Sessão Fonoaudiologia", profissionais: ["fono", "estag"] },
  { id: "psico", nome: "Sessão Psicologia", profissionais: ["psi"] },
  { id: "reuniao", nome: "Reuniões e Visitas", profissionais: [] },
];

describe("profissionaisDoTipo", () => {
  const profs = [{ id: "psi" }, { id: "fono" }, { id: "estag" }];
  it("filtra pelos vinculados", () => {
    expect(profissionaisDoTipo(["fono", "estag"], profs).map((p) => p.id)).toEqual(["fono", "estag"]);
  });
  it("sem vínculos ou sem tipo: todos", () => {
    expect(profissionaisDoTipo([], profs)).toHaveLength(3);
    expect(profissionaisDoTipo(null, profs)).toHaveLength(3);
  });
});

describe("atendeOTipo", () => {
  it("vinculado, ou tipo aberto a todos", () => {
    expect(atendeOTipo(tipos[1], "fono")).toBe(true);
    expect(atendeOTipo(tipos[1], "psi")).toBe(false);
    expect(atendeOTipo(tipos[3], "psi")).toBe(true);
  });
});

describe("tipoSugerido", () => {
  it("único tipo do profissional", () => {
    expect(tipoSugerido({ id: "estag", especialidade: "Estagiária de Fono" }, tipos)).toBe("fono");
  });
  it("vários tipos: desempata pela especialidade", () => {
    expect(tipoSugerido({ id: "psi", especialidade: "Psicóloga" }, tipos)).toBe("psico");
  });
  it("sem vínculos: nenhuma sugestão", () => {
    expect(tipoSugerido({ id: "nutri", especialidade: "Nutricionista" }, tipos)).toBeNull();
    expect(tipoSugerido(undefined, tipos)).toBeNull();
  });
});
