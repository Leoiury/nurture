import { describe, expect, it } from "vitest";
import { ehEmailInterno, emailInterno, identificacaoDoLogin, normalizarUsuario, usuarioValido } from "./nome-de-usuario";

describe("nome de usuário", () => {
  it("normaliza e valida", () => {
    expect(normalizarUsuario("  Ana.Costa ")).toBe("ana.costa");
    for (const bom of ["ana", "ana.costa", "ana_costa-2", "2ana"]) expect(usuarioValido(bom)).toBe(true);
    for (const ruim of ["an", "ana costa", "ana@clinica", ".ana", "Ana", "a".repeat(31), "joão"]) expect(usuarioValido(ruim)).toBe(false);
  });

  it("o e-mail interno não aparece: a identificação é o usuário, ou o e-mail nos antigos", () => {
    expect(ehEmailInterno(emailInterno("ana"))).toBe(true);
    expect(ehEmailInterno("ana@clinica.com")).toBe(false);
    expect(identificacaoDoLogin({ usuario: "ana", email: emailInterno("ana") })).toBe("ana");
    expect(identificacaoDoLogin({ usuario: null, email: "ana@clinica.com" })).toBe("ana@clinica.com");
  });
});
