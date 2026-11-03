// Exportação do registro de um atendimento: as mesmas seções viram HTML (copiar e
// imprimir) e definição de PDF. Word fica em exportar-word.ts, pelo tamanho da biblioteca.

import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { CORES_DE_FUNDO, CORES_DO_TEXTO, temConteudo, type ConteudoDoRegistro, type Documento } from "./conteudo";

export type DadosDoDocumento = {
  paciente: string;
  /** Data e horário do atendimento, já por extenso. */
  quando: string;
  /** Data do atendimento (AAAA-MM-DD), para o nome do arquivo. */
  data: string;
  profissional: string;
};

/** Sem título, a seção é o próprio documento (o relatório). */
export type Secao = { titulo: string | null; texto: Documento | null };

export const TITULO_DO_DOCUMENTO = "Registro de atendimento";
const SEM_TEXTO = "Sem texto.";

/** O que entra no documento: o modelo em uso e as observações (no relatório, só se houver). */
export function secoesDoRegistro(c: ConteudoDoRegistro): Secao[] {
  const observacoes = { titulo: "Observações", texto: c.observacoes };
  if (c.modelo === "relatorio") return [{ titulo: null, texto: c.relatorio }, ...(temConteudo(c.observacoes) ? [observacoes] : [])];
  return [...c.topicos.map((t) => ({ titulo: t.pergunta, texto: t.resposta })), observacoes];
}

/** Sem caracteres que os sistemas de arquivos recusam. */
export function nomeDoArquivo(d: DadosDoDocumento, extensao: "pdf" | "docx"): string {
  const paciente = d.paciente.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `Atendimento - ${paciente} - ${d.data}.${extensao}`;
}

/** As marcas de um trecho, já conferidas com a paleta: nada de fora chega ao documento. */
export function marcasDoTrecho(no: Documento) {
  const atributo = (tipo: string) => no.marks?.find((m) => m.type === tipo);
  const corDe = (tipo: string, paleta: string[]) => {
    const cor = atributo(tipo)?.attrs?.cor;
    return typeof cor === "string" && paleta.includes(cor) ? cor : null;
  };
  return {
    negrito: !!atributo("bold"),
    italico: !!atributo("italic"),
    sublinhado: !!atributo("sublinhado"),
    corDoSublinhado: corDe("sublinhado", CORES_DO_TEXTO),
    cor: corDe("cor", CORES_DO_TEXTO),
    fundo: corDe("fundo", CORES_DE_FUNDO),
  };
}

// HTML ---------------------------------------------------------------------------------

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function trechoEmHtml(no: Documento): string {
  if (no.type === "hardBreak") return "<br>";
  const m = marcasDoTrecho(no);
  let html = escapar(no.text ?? "");
  if (m.negrito) html = `<strong>${html}</strong>`;
  if (m.italico) html = `<em>${html}</em>`;
  if (m.sublinhado) html = `<u${m.corDoSublinhado ? ` style="text-decoration-color:${m.corDoSublinhado}"` : ""}>${html}</u>`;
  const estilos = [m.cor && `color:${m.cor}`, m.fundo && `background-color:${m.fundo}`].filter(Boolean);
  return estilos.length ? `<span style="${estilos.join(";")}">${html}</span>` : html;
}

function blocoEmHtml(no: Documento): string {
  const filhos = () => (no.content ?? []).map(blocoEmHtml).join("");
  switch (no.type) {
    case "paragraph":
      return `<p>${(no.content ?? []).map(trechoEmHtml).join("") || "&nbsp;"}</p>`;
    case "bulletList":
      return `<ul>${filhos()}</ul>`;
    case "orderedList":
      return `<ol>${filhos()}</ol>`;
    case "listItem":
      return `<li>${filhos()}</li>`;
    case "horizontalRule":
      return "<hr>";
    default:
      return filhos();
  }
}

/** Título, dados do atendimento e seções. É o que vai para a área de transferência e para a impressão. */
export function paraHtml(d: DadosDoDocumento, secoes: Secao[]): string {
  const corpo = secoes.map((s) => `${s.titulo ? `<h2>${escapar(s.titulo)}</h2>` : ""}${temConteudo(s.texto) ? blocoEmHtml(s.texto!) : `<p>${SEM_TEXTO}</p>`}`).join("");
  return `<h1>${TITULO_DO_DOCUMENTO}</h1><p><strong>Paciente:</strong> ${escapar(d.paciente)}<br><strong>Data:</strong> ${escapar(d.quando)}<br><strong>Profissional:</strong> ${escapar(d.profissional)}</p>${corpo}`;
}

function blocoEmTexto(no: Documento): string {
  if (no.type === "hardBreak") return "\n";
  if (no.type === "horizontalRule") return "----------\n";
  if (no.text !== undefined) return no.text;
  const interno = (no.content ?? []).map(blocoEmTexto).join("");
  if (no.type === "paragraph") return `${interno}\n`;
  if (no.type === "listItem") return `- ${interno}`;
  return interno;
}

/** Versão sem formatação, para quem cola onde não há HTML. */
export function paraTexto(d: DadosDoDocumento, secoes: Secao[]): string {
  const corpo = secoes.map((s) => `${s.titulo ? `${s.titulo}\n` : ""}${temConteudo(s.texto) ? blocoEmTexto(s.texto!).trim() : SEM_TEXTO}`).join("\n\n");
  return `${TITULO_DO_DOCUMENTO}\nPaciente: ${d.paciente}\nData: ${d.quando}\nProfissional: ${d.profissional}\n\n${corpo}\n`;
}

// PDF ----------------------------------------------------------------------------------

function trechoEmPdf(no: Documento) {
  if (no.type === "hardBreak") return { text: "\n" };
  const m = marcasDoTrecho(no);
  return {
    text: no.text ?? "",
    bold: m.negrito,
    italics: m.italico,
    ...(m.sublinhado ? { decoration: "underline" as const } : {}),
    ...(m.corDoSublinhado ? { decorationColor: m.corDoSublinhado } : {}),
    ...(m.cor ? { color: m.cor } : {}),
    ...(m.fundo ? { background: m.fundo } : {}),
  };
}

const LARGURA_DA_LINHA = 515;

const RECUO_DA_LISTA = 15;

function blocoEmPdf(no: Documento, nivel = 0): Content[] {
  const filhos = () => (no.content ?? []).flatMap((f) => blocoEmPdf(f, nivel));
  switch (no.type) {
    case "paragraph":
      return [{ text: no.content?.length ? no.content.map(trechoEmPdf) : " ", margin: [0, 0, 0, 4] }];
    case "bulletList":
      return [{ ul: (no.content ?? []).map((item) => ({ stack: blocoEmPdf(item, nivel + 1) })), margin: [0, 0, 0, 4] }];
    case "orderedList":
      return [{ ol: (no.content ?? []).map((item) => ({ stack: blocoEmPdf(item, nivel + 1) })), margin: [0, 0, 0, 4] }];
    case "horizontalRule":
      return [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: LARGURA_DA_LINHA - RECUO_DA_LISTA * nivel, y2: 0, lineWidth: 0.75, lineColor: "#9ca3af" }], margin: [0, 6, 0, 8] }];
    default:
      return filhos();
  }
}

export function paraPdf(d: DadosDoDocumento, secoes: Secao[]): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [40, 48, 40, 48],
    info: { title: `${TITULO_DO_DOCUMENTO} - ${d.paciente}` },
    defaultStyle: { fontSize: 11, lineHeight: 1.25 },
    footer: (pagina, total) => ({ text: `${pagina} de ${total}`, alignment: "right", margin: [0, 16, 40, 0], fontSize: 9, color: "#6b7280" }),
    content: [
      { text: TITULO_DO_DOCUMENTO, fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
      { text: [{ text: "Paciente: ", bold: true }, d.paciente] },
      { text: [{ text: "Data: ", bold: true }, d.quando] },
      { text: [{ text: "Profissional: ", bold: true }, d.profissional], margin: [0, 0, 0, 10] },
      ...secoes.flatMap((s): Content[] => [
        ...(s.titulo ? [{ text: s.titulo, fontSize: 13, bold: true, margin: [0, 10, 0, 4], keepWithNext: true } as Content] : []),
        ...(temConteudo(s.texto) ? blocoEmPdf(s.texto!) : [{ text: SEM_TEXTO, color: "#6b7280" } as Content]),
      ]),
    ],
  };
}
