// Tipos de visualização da agenda. Módulo sem React: usado tanto pelos
// componentes de servidor (página, navegação) quanto pelos de cliente.

/**
 * empilhada: dias um abaixo do outro, escala ajustada para 08–18 caber na tela.
 * ampliada: como a empilhada, com escala fixa alta (linhas e cards maiores).
 * lado: semana inteira numa tela, dias lado a lado (só para a semana).
 */
export type Visao = "empilhada" | "ampliada" | "lado";

export function lerVisao(valor: unknown): Visao {
  return valor === "lado" || valor === "ampliada" ? valor : "empilhada";
}

/** Parâmetro de URL que preserva a visão ("" para a padrão). */
export function sufixoDaVisao(visao: Visao): string {
  return visao === "empilhada" ? "" : `&visao=${visao}`;
}
