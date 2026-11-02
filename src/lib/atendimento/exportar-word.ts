// Registro de um atendimento em Word (.docx). Biblioteca pesada: só é carregada ao exportar.

import { AlignmentType, BorderStyle, Document, LevelFormat, Paragraph, ShadingType, TextRun, UnderlineType } from "docx";
import { temConteudo, type Documento } from "./conteudo";
import { TITULO_DO_DOCUMENTO, marcasDoTrecho, type DadosDoDocumento, type Secao } from "./exportar";

const NUMERACAO = "lista-numerada";
const NIVEIS = 4;

/** No Word, as cores vão sem o "#". */
const hex = (cor: string) => cor.replace("#", "");

function trechoEmWord(no: Documento): TextRun {
  if (no.type === "hardBreak") return new TextRun({ break: 1 });
  const m = marcasDoTrecho(no);
  return new TextRun({
    text: no.text ?? "",
    bold: m.negrito,
    italics: m.italico,
    ...(m.sublinhado ? { underline: { type: UnderlineType.SINGLE, ...(m.corDoSublinhado ? { color: hex(m.corDoSublinhado) } : {}) } } : {}),
    ...(m.cor ? { color: hex(m.cor) } : {}),
    ...(m.fundo ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(m.fundo) } } : {}),
  });
}

type Lista = { tipo: "marcadores" } | { tipo: "numerada"; instancia: number };

function blocoEmWord(no: Documento, novaInstancia: () => number, lista?: Lista, nivel = 0): Paragraph[] {
  const emLista = lista && (lista.tipo === "marcadores" ? { bullet: { level: nivel } } : { numbering: { reference: NUMERACAO, level: nivel, instance: lista.instancia } });
  switch (no.type) {
    case "paragraph":
      return [new Paragraph({ children: (no.content ?? []).map(trechoEmWord), spacing: { after: 80 }, ...emLista })];
    case "horizontalRule":
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF", space: 1 } }, spacing: { after: 120 } })];
    case "bulletList":
    case "orderedList": {
      // Cada lista numerada recomeça do 1. Dentro de um item, ela desce um nível.
      const nova: Lista = no.type === "bulletList" ? { tipo: "marcadores" } : { tipo: "numerada", instancia: novaInstancia() };
      const nivelDaLista = lista ? nivel + 1 : 0;
      return (no.content ?? []).flatMap((item) => (item.content ?? []).flatMap((filho) => blocoEmWord(filho, novaInstancia, nova, nivelDaLista)));
    }
    default:
      return (no.content ?? []).flatMap((filho) => blocoEmWord(filho, novaInstancia, lista, nivel));
  }
}

export function paraWord(d: DadosDoDocumento, secoes: Secao[]): Document {
  let instancias = 0;
  const novaInstancia = () => ++instancias;
  const linhaDeDado = (rotulo: string, valor: string, depois = 0) =>
    new Paragraph({ children: [new TextRun({ text: `${rotulo}: `, bold: true }), new TextRun(valor)], spacing: { after: depois } });

  return new Document({
    title: `${TITULO_DO_DOCUMENTO} - ${d.paciente}`,
    numbering: {
      config: [
        {
          reference: NUMERACAO,
          levels: Array.from({ length: NIVEIS }, (_, nivel) => ({
            level: nivel,
            format: LevelFormat.DECIMAL,
            text: `%${nivel + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (nivel + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: TITULO_DO_DOCUMENTO, bold: true, size: 36 })], spacing: { after: 160 } }),
          linhaDeDado("Paciente", d.paciente),
          linhaDeDado("Data", d.quando),
          linhaDeDado("Profissional", d.profissional, 200),
          ...secoes.flatMap((s) => [
            new Paragraph({ children: [new TextRun({ text: s.titulo, bold: true, size: 26 })], spacing: { before: 200, after: 80 }, keepNext: true }),
            ...(temConteudo(s.texto) ? blocoEmWord(s.texto!, novaInstancia) : [new Paragraph({ children: [new TextRun({ text: "Sem texto.", color: "6B7280" })] })]),
          ]),
        ],
      },
    ],
  });
}
