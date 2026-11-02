// Conteúdo de uma anamnese: cópia das perguntas do modelo com as respostas.

export type ItemDaAnamnese = {
  /** Pergunta do modelo de onde veio (o modelo pode já não tê-la). */
  perguntaId: string;
  pergunta: string;
  resposta: string;
};

export type PerguntaDoModelo = { id: string; texto: string };

/**
 * Anamnese em andamento diante do modelo atual: entram as perguntas novas, saem as
 * excluídas, e a ordem e os textos seguem o modelo. Uma pergunta excluída que já tem
 * resposta fica no fim, para nada do que foi digitado se perder.
 * Só para anamneses ainda não salvas: as salvas nunca mudam com o modelo.
 */
export function sincronizarComModelo(itens: ItemDaAnamnese[], modelo: PerguntaDoModelo[]): ItemDaAnamnese[] {
  const respostas = new Map(itens.map((i) => [i.perguntaId, i.resposta]));
  const noModelo = new Set(modelo.map((p) => p.id));
  return [
    ...modelo.map((p) => ({ perguntaId: p.id, pergunta: p.texto, resposta: respostas.get(p.id) ?? "" })),
    ...itens.filter((i) => !noModelo.has(i.perguntaId) && i.resposta.trim()),
  ];
}
