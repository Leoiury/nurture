import { describe, expect, it } from "vitest";
import { sincronizarComModelo } from "./conteudo";

const item = (perguntaId: string, pergunta: string, resposta = "") => ({ perguntaId, pergunta, resposta });

describe("sincronizarComModelo", () => {
  it("começa do modelo, com as respostas vazias", () => {
    expect(sincronizarComModelo([], [{ id: "a", texto: "Queixa" }])).toEqual([item("a", "Queixa")]);
  });

  it("mantém as respostas, com a ordem e os textos do modelo", () => {
    const itens = [item("a", "Queixa", "dor"), item("b", "Histórico", "nenhum")];
    const modelo = [
      { id: "b", texto: "Histórico familiar" },
      { id: "a", texto: "Queixa" },
    ];
    expect(sincronizarComModelo(itens, modelo)).toEqual([item("b", "Histórico familiar", "nenhum"), item("a", "Queixa", "dor")]);
  });

  it("uma pergunta nova entra vazia", () => {
    const novo = sincronizarComModelo([item("a", "Queixa", "dor")], [{ id: "a", texto: "Queixa" }, { id: "n", texto: "Sono" }]);
    expect(novo.at(-1)).toEqual(item("n", "Sono"));
  });

  it("pergunta excluída sai se estiver vazia", () => {
    expect(sincronizarComModelo([item("a", "Queixa"), item("b", "  ", "   ")], [])).toEqual([]);
  });

  it("pergunta excluída com resposta fica no fim, para não perder o texto", () => {
    const novo = sincronizarComModelo([item("x", "Antiga", "importante"), item("a", "Queixa", "dor")], [{ id: "a", texto: "Queixa" }]);
    expect(novo).toEqual([item("a", "Queixa", "dor"), item("x", "Antiga", "importante")]);
  });
});
