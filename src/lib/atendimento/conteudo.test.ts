import { describe, expect, it } from "vitest";
import { conteudoVazio, sincronizarTopicos, temConteudo, type Documento } from "./conteudo";

const texto = (t: string): Documento => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const vazio: Documento = { type: "doc", content: [{ type: "paragraph" }] };

describe("temConteudo", () => {
  it("reconhece texto, inclusive dentro de listas", () => {
    expect(temConteudo(texto("oi"))).toBe(true);
    expect(temConteudo({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [texto("item")] }] }] })).toBe(true);
  });

  it("documento vazio, nulo ou só com espaços não conta", () => {
    expect(temConteudo(null)).toBe(false);
    expect(temConteudo(vazio)).toBe(false);
    expect(temConteudo(texto("   "))).toBe(false);
  });

  it("uma linha horizontal conta", () => {
    expect(temConteudo({ type: "doc", content: [{ type: "horizontalRule" }] })).toBe(true);
  });
});

describe("sincronizarTopicos", () => {
  const base = conteudoVazio("topicos", [{ id: "a", texto: "Evolução" }]);

  it("começa do modelo, sem respostas, e guarda o modelo escolhido", () => {
    expect(base).toEqual({ modelo: "topicos", topicos: [{ perguntaId: "a", pergunta: "Evolução", resposta: null }], relatorio: null, observacoes: null });
  });

  it("mantém as respostas, com a ordem e os textos do modelo", () => {
    const c = { ...base, topicos: [{ perguntaId: "a", pergunta: "Evolução", resposta: texto("x") }, { perguntaId: "b", pergunta: "Conduta", resposta: null }] };
    const novo = sincronizarTopicos(c, [{ id: "b", texto: "Plano" }, { id: "a", texto: "Evolução" }]);
    expect(novo.topicos.map((t) => t.pergunta)).toEqual(["Plano", "Evolução"]);
    expect(novo.topicos[1].resposta).toEqual(texto("x"));
  });

  it("tópico excluído sai se vazio e fica no fim se tiver texto", () => {
    const c = { ...base, topicos: [{ perguntaId: "x", pergunta: "Antigo", resposta: texto("importante") }, { perguntaId: "y", pergunta: "Vazio", resposta: vazio }] };
    expect(sincronizarTopicos(c, [{ id: "a", texto: "Evolução" }]).topicos.map((t) => t.perguntaId)).toEqual(["a", "x"]);
  });

  it("não mexe no relatório nem nas observações", () => {
    const c = { ...base, relatorio: texto("r"), observacoes: texto("o"), modelo: "relatorio" as const };
    const novo = sincronizarTopicos(c, []);
    expect(novo.relatorio).toEqual(texto("r"));
    expect(novo.observacoes).toEqual(texto("o"));
    expect(novo.modelo).toBe("relatorio");
  });
});
