// Conteúdo do registro de um atendimento. Os textos são documentos do editor (JSON):
// assim, o que é exibido passa sempre pelas mesmas regras de formatação do editor.

export const CORES_DO_TEXTO = ["#b91c1c", "#c2410c", "#15803d", "#1d4ed8", "#7e22ce"];
export const CORES_DE_FUNDO = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa"];

export type Documento = {
  type: string;
  text?: string;
  content?: Documento[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
};

export type ModeloDoRegistro = "topicos" | "relatorio";

export type TopicoDoRegistro = { perguntaId: string; pergunta: string; resposta: Documento | null };

export type ConteudoDoRegistro = {
  modelo: ModeloDoRegistro;
  topicos: TopicoDoRegistro[];
  relatorio: Documento | null;
  observacoes: Documento | null;
};

export type TopicoDoModelo = { id: string; texto: string };

/** O documento tem algo escrito (uma linha horizontal sozinha também conta). */
export function temConteudo(doc: Documento | null | undefined): boolean {
  if (!doc) return false;
  if (doc.type === "horizontalRule") return true;
  if (doc.text?.trim()) return true;
  return !!doc.content?.some(temConteudo);
}

export function conteudoVazio(modelo: ModeloDoRegistro, topicos: TopicoDoModelo[]): ConteudoDoRegistro {
  return { modelo, topicos: topicos.map((t) => ({ perguntaId: t.id, pergunta: t.texto, resposta: null })), relatorio: null, observacoes: null };
}

/**
 * Registro ainda não salvo diante do modelo atual: entram os tópicos novos, saem os
 * excluídos, e a ordem e os textos seguem o modelo. Tópico excluído com texto fica no
 * fim, para nada se perder. Registros já salvos nunca mudam com o modelo.
 */
export function sincronizarTopicos(conteudo: ConteudoDoRegistro, modelo: TopicoDoModelo[]): ConteudoDoRegistro {
  const respostas = new Map(conteudo.topicos.map((t) => [t.perguntaId, t.resposta]));
  const noModelo = new Set(modelo.map((t) => t.id));
  return {
    ...conteudo,
    topicos: [
      ...modelo.map((t) => ({ perguntaId: t.id, pergunta: t.texto, resposta: respostas.get(t.id) ?? null })),
      ...conteudo.topicos.filter((t) => !noModelo.has(t.perguntaId) && temConteudo(t.resposta)),
    ],
  };
}
