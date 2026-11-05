import { describe, expect, it } from "vitest";
import { identificacaoDoLogin, normalizarUsuario, sugerirUsuario, usuarioValido } from "./nome-de-usuario";

describe("nome de usuário", () => {
  it("normaliza e valida", () => {
    expect(normalizarUsuario("  Ana.Costa ")).toBe("ana.costa");
    for (const bom of ["ana", "ana.costa", "ana_costa-2", "2ana"]) expect(usuarioValido(bom)).toBe(true);
    for (const ruim of ["an", "ana costa", "ana@clinica", ".ana", "Ana", "a".repeat(31), "joão"]) expect(usuarioValido(ruim)).toBe(false);
  });

  it("sugere o usuário a partir do nome do profissional", () => {
    expect(sugerirUsuario("Júlia Palaoro Tesk")).toBe("julia.palaoro.tesk");
    expect(sugerirUsuario("  Conceição  D'Ávila ")).toBe("conceicao.davila");
    expect(sugerirUsuario("Dra. Ana - Maria (Fono)")).toBe("dra.ana.maria.fono");
    expect(sugerirUsuario("Ana-Maria")).toBe("ana-maria");
    expect(sugerirUsuario("Bianca Albuquerque Vasconcelos Figueiredo")).toBe("bianca.albuquerque.vasconcelos");
    expect(sugerirUsuario("A".repeat(40))).toBe("a".repeat(30));
    for (const sem of ["", "Jo", "...", "李明"]) expect(sugerirUsuario(sem)).toBe("");
  });

  it("a identificação é o usuário, ou o e-mail nos logins antigos", () => {
    expect(identificacaoDoLogin({ usuario: "ana", email: "ana@clinica.com" })).toBe("ana");
    expect(identificacaoDoLogin({ usuario: null, email: "ana@clinica.com" })).toBe("ana@clinica.com");
  });
});
