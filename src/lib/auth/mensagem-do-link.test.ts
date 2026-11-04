import { describe, expect, it } from "vitest";
import { linkDoWhatsApp, mensagemDoLink } from "./mensagem-do-link";

describe("mensagem do link", () => {
  it("diz o que o link faz e até quando vale, no fuso da clínica", () => {
    const login = mensagemDoLink("login", "Ana", "https://x/cadastro/abc", "2026-11-11T02:00:00Z");
    expect(login).toContain("nome de usuário e sua senha");
    expect(login).toContain("https://x/cadastro/abc");
    expect(login).toContain("10/11/2026");
    const senha = mensagemDoLink("senha", "Ana", "https://x/cadastro/abc", "2026-11-11T02:00:00Z");
    expect(senha).toContain("redefinir");
    expect(senha).toContain("10/11/2026 às 23:00");
  });

  it("monta o WhatsApp com o DDI do Brasil, e não inventa número", () => {
    expect(linkDoWhatsApp("(11) 98765-4321", "oi e tchau")).toBe("https://wa.me/5511987654321?text=oi%20e%20tchau");
    expect(linkDoWhatsApp("+55 11 3333-4444", "x")).toBe("https://wa.me/551133334444?text=x");
    expect(linkDoWhatsApp("123", "x")).toBeNull();
    expect(linkDoWhatsApp(null, "x")).toBeNull();
  });
});
