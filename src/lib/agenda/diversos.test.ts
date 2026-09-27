import { describe, expect, it } from "vitest";
import { escalaParaCaber, geometriaDoCard, nomeAbreviado } from "@/app/(app)/agenda/comum";
import { PALETA_PLANOS, TEXTO_CLARO, TEXTO_ESCURO, corDoTexto } from "./cores";
import { lerValor } from "./valores";
import { lerVisao, sufixoDaVisao } from "./visao";

describe("escalaParaCaber", () => {
  const limites = { padrao: 14, min: 9, max: 30 };

  it("faz o expediente (40 quartos de hora) caber na altura disponível", () => {
    expect(escalaParaCaber(600, limites)).toBe(15);
  });

  it("respeita o mínimo legível e o máximo", () => {
    expect(escalaParaCaber(200, limites)).toBe(9);
    expect(escalaParaCaber(4000, limites)).toBe(30);
  });

  it("usa o padrão antes de a altura ser medida", () => {
    expect(escalaParaCaber(null, limites)).toBe(14);
  });
});

describe("nomeAbreviado", () => {
  it("usa o primeiro nome e a inicial do primeiro sobrenome", () => {
    expect(nomeAbreviado("Júlia Palaoro Tesk")).toBe("Júlia P.");
    expect(nomeAbreviado("Diego Bernardo")).toBe("Diego B.");
  });

  it("ignora partículas como da/de/dos", () => {
    expect(nomeAbreviado("Jesebel da Silva")).toBe("Jesebel S.");
    expect(nomeAbreviado("Marilda de  Paula")).toBe("Marilda P.");
  });

  it("nome único fica como está", () => {
    expect(nomeAbreviado("Jesebel")).toBe("Jesebel");
  });
});

describe("geometriaDoCard", () => {
  it("card sozinho ocupa a coluna até a largura máxima", () => {
    expect(geometriaDoCard(0, 1, 72, 280)).toEqual({ left: "0px", width: "min(100%, 280px)" });
  });

  it("paralelos dividem a coluna respeitando mínimo e máximo", () => {
    const { width, left } = geometriaDoCard(1, 2, 72, 280);
    expect(width).toBe("clamp(72px, calc(100% / 2 - 2px), 280px)");
    expect(left).toContain("calc(100% - clamp(72px");
  });
});

describe("corDoTexto", () => {
  it("usa texto branco em fundo escuro e escuro em fundo claro", () => {
    expect(corDoTexto("#2E7D5B")).toBe(TEXTO_CLARO); // verde escuro
    expect(corDoTexto("#F6D365")).toBe(TEXTO_ESCURO); // amarelo
  });

  it("toda cor da paleta é um hex válido", () => {
    for (const cor of PALETA_PLANOS) expect(cor.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("visão", () => {
  it("lê a visão da URL com padrão empilhada", () => {
    expect(lerVisao("lado")).toBe("lado");
    expect(lerVisao("ampliada")).toBe("ampliada");
    expect(lerVisao("qualquer")).toBe("empilhada");
    expect(lerVisao(undefined)).toBe("empilhada");
  });

  it("só adiciona parâmetro para visões diferentes da padrão", () => {
    expect(sufixoDaVisao("empilhada")).toBe("");
    expect(sufixoDaVisao("lado")).toBe("&visao=lado");
  });
});

describe("lerValor", () => {
  it("aceita formatos brasileiros e com ponto decimal", () => {
    expect(lerValor("150")).toBe(150);
    expect(lerValor("150,50")).toBe(150.5);
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("R$ 80")).toBe(80);
    expect(lerValor("150.5")).toBe(150.5); // não vira 1505
    expect(lerValor("150.00")).toBe(150); // não vira 15000
  });

  it("vazio é null e texto inválido é NaN", () => {
    expect(lerValor("  ")).toBeNull();
    expect(lerValor("abc")).toBeNaN();
  });
});
