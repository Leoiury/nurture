import { Packer } from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ConteudoDoRegistro, Documento } from "./conteudo";
import { nomeDoArquivo, paraHtml, paraPdf, paraTexto, secoesDoRegistro, type DadosDoDocumento, type Secao } from "./exportar";
import { paraWord } from "./exportar-word";

const dados: DadosDoDocumento = { paciente: "Maria <Souza>", quando: "7 de dezembro às 09:00", data: "2026-12-07", profissional: "Dra. Ana" };

const texto = (t: string, marks?: Documento["marks"]): Documento => ({ type: "text", text: t, marks });
const paragrafo = (...content: Documento[]): Documento => ({ type: "paragraph", content });
const doc = (...content: Documento[]): Documento => ({ type: "doc", content });

const FORMATADO = doc(
  paragrafo(
    texto("forte", [{ type: "bold" }]),
    texto(" inclinado", [{ type: "italic" }]),
    texto(" azul", [{ type: "cor", attrs: { cor: "#1d4ed8" } }]),
    texto(" fundo", [{ type: "fundo", attrs: { cor: "#fef08a" } }]),
    texto(" linha", [{ type: "sublinhado", attrs: { cor: "#b91c1c" } }]),
  ),
  { type: "bulletList", content: [{ type: "listItem", content: [paragrafo(texto("item"))] }] },
  { type: "orderedList", content: [{ type: "listItem", content: [paragrafo(texto("primeiro"))] }] },
  { type: "horizontalRule" },
);
const secoes: Secao[] = [
  { titulo: "Evolução", texto: FORMATADO },
  { titulo: "Observações", texto: null },
];

describe("secoesDoRegistro", () => {
  const base: ConteudoDoRegistro = {
    modelo: "topicos",
    topicos: [{ perguntaId: "a", pergunta: "Evolução", resposta: null }],
    relatorio: doc(paragrafo(texto("relatório"))),
    observacoes: null,
  };

  it("entra só o modelo em uso, sempre com as observações", () => {
    expect(secoesDoRegistro(base).map((s) => s.titulo)).toEqual(["Evolução", "Observações"]);
    expect(secoesDoRegistro({ ...base, modelo: "relatorio" }).map((s) => s.titulo)).toEqual(["Relatório", "Observações"]);
  });
});

describe("nomeDoArquivo", () => {
  it("tira os caracteres que os sistemas de arquivos recusam", () => {
    expect(nomeDoArquivo({ ...dados, paciente: 'Ana/ Maria: "Teste"?' }, "pdf")).toBe("Atendimento - Ana Maria Teste - 2026-12-07.pdf");
  });
});

describe("paraHtml", () => {
  const html = paraHtml(dados, secoes);

  it("mantém a formatação", () => {
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<em> inclinado</em>");
    expect(html).toContain('style="color:#1d4ed8"');
    expect(html).toContain('style="background-color:#fef08a"');
    expect(html).toContain('<u style="text-decoration-color:#b91c1c"> linha</u>');
    expect(html).toContain("<ul><li><p>item</p></li></ul>");
    expect(html).toContain("<ol><li><p>primeiro</p></li></ol>");
    expect(html).toContain("<hr>");
  });

  it("escapa o que veio do usuário", () => {
    expect(html).toContain("Maria &lt;Souza&gt;");
    const perigoso = paraHtml(dados, [{ titulo: "<script>x</script>", texto: doc(paragrafo(texto("<img src=x onerror=alert(1)>"))) }]);
    expect(perigoso).not.toContain("<script>");
    expect(perigoso).not.toContain("<img");
  });

  it("cor fora da paleta não chega ao documento", () => {
    const ruim = doc(paragrafo(texto("x", [{ type: "cor", attrs: { cor: "red;background:url(https://exemplo.test/a)" } }])));
    expect(paraHtml(dados, [{ titulo: "T", texto: ruim }])).not.toContain("exemplo.test");
  });

  it("seção vazia avisa", () => {
    expect(html).toContain("<h2>Observações</h2><p>Sem texto.</p>");
  });
});

describe("paraTexto", () => {
  it("traz os dados e os textos, sem marcação", () => {
    const t = paraTexto(dados, secoes);
    expect(t).toContain("Paciente: Maria <Souza>");
    expect(t).toContain("forte inclinado azul fundo linha");
    expect(t).toContain("- item");
    expect(t).not.toContain("<strong>");
  });
});

describe("paraPdf", () => {
  const definicao = JSON.stringify(paraPdf(dados, secoes).content);

  it("leva a formatação e as listas", () => {
    expect(definicao).toContain('"text":"forte","bold":true');
    expect(definicao).toContain('"italics":true');
    expect(definicao).toContain('"color":"#1d4ed8"');
    expect(definicao).toContain('"background":"#fef08a"');
    expect(definicao).toContain('"decoration":"underline","decorationColor":"#b91c1c"');
    expect(definicao).toContain('"ul":');
    expect(definicao).toContain('"ol":');
    expect(definicao).toContain('"canvas":');
  });

  it("traz os dados do atendimento", () => {
    expect(definicao).toContain("Maria <Souza>");
    expect(definicao).toContain("Dra. Ana");
    expect(definicao).toContain("Sem texto.");
  });
});

describe("paraWord", () => {
  async function xml(s: Secao[]) {
    const zip = await JSZip.loadAsync(await Packer.toBuffer(paraWord(dados, s)));
    return zip.file("word/document.xml")!.async("string");
  }

  it("gera um documento com os textos e a formatação", async () => {
    const x = await xml(secoes);
    expect(x).toContain("Maria &lt;Souza&gt;");
    expect(x).toContain("forte");
    expect(x).toContain('<w:color w:val="1d4ed8"/>');
    expect(x).toContain('w:fill="fef08a"');
    expect(x).toContain('w:val="single" w:color="b91c1c"');
    expect(x).toContain("w:numPr");
    expect(x).toContain("Sem texto.");
  });

  it("cada lista numerada recomeça", async () => {
    const lista: Documento = { type: "orderedList", content: [{ type: "listItem", content: [paragrafo(texto("um"))] }] };
    const zip = await JSZip.loadAsync(await Packer.toBuffer(paraWord(dados, [{ titulo: "T", texto: doc(lista, lista) }])));
    const numeracao = await zip.file("word/numbering.xml")!.async("string");
    expect(numeracao.match(/w:startOverride/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
