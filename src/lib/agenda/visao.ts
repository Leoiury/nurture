// Tipos de visualização da agenda. Módulo sem React: usado tanto pelos
// componentes de servidor (página, navegação) quanto pelos de cliente.

/**
 * empilhada: dias um abaixo do outro, escala ajustada para 08–18 caber na tela.
 * ampliada: como a empilhada, com escala fixa alta (linhas e cards maiores).
 * lado: semana inteira numa tela, dias lado a lado (só para a semana).
 * pessoal: como a lado, só com os atendimentos do próprio login (ADM que também atende).
 */
export type Visao = "empilhada" | "ampliada" | "lado" | "pessoal";

export function lerVisao(valor: unknown): Visao {
  return valor === "lado" || valor === "ampliada" || valor === "pessoal" ? valor : "empilhada";
}

/** Parâmetros de URL que preservam a visão e o planejamento ("" para a padrão). */
export function sufixoDaVisao(visao: Visao, planejamento = false): string {
  return (visao === "empilhada" ? "" : `&visao=${visao}`) + (planejamento ? "&planejamento=1" : "");
}
