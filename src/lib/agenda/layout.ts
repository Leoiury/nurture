// Geometria da grade da agenda: eixo Y = tempo, eixo X = profissionais.

export type Intervalo = { inicio: number; fim: number }; // minutos desde 00:00

export type Segmento = {
  inicio: number;
  fim: number;
  /** Faixa sem atendimentos, exibida achatada. */
  compacto: boolean;
};

/**
 * Divide o período visível em segmentos de 1 hora. Horas consecutivas sem nenhum
 * atendimento viram um único segmento compacto (quando `compactar` está ligado),
 * exceto as que o usuário expandiu manualmente.
 */
export function montarSegmentos(
  intervalos: Intervalo[],
  opcoes: { inicioPadrao: number; fimPadrao: number; compactar: boolean; expandidos: Set<number> },
): Segmento[] {
  const inicio = Math.min(opcoes.inicioPadrao, ...intervalos.map((i) => Math.floor(i.inicio / 60) * 60));
  const fim = Math.max(opcoes.fimPadrao, ...intervalos.map((i) => Math.ceil(i.fim / 60) * 60));

  const segmentos: Segmento[] = [];
  for (let h = inicio; h < fim; h += 60) {
    const ocupada = intervalos.some((i) => i.inicio < h + 60 && i.fim > h);
    const compacto = opcoes.compactar && !ocupada && !opcoes.expandidos.has(h);
    const anterior = segmentos.at(-1);
    if (compacto && anterior?.compacto) anterior.fim = h + 60;
    else segmentos.push({ inicio: h, fim: h + 60, compacto });
  }
  return segmentos;
}

export const ALTURA_COMPACTA = 22;

export function alturaDoSegmento(s: Segmento, pxPorQuarto: number): number {
  return s.compacto ? ALTURA_COMPACTA : ((s.fim - s.inicio) / 15) * pxPorQuarto;
}

/** Converte minutos do dia em posição vertical (px) dentro da grade. */
export function posicaoY(minutos: number, segmentos: Segmento[], pxPorQuarto: number): number {
  let y = 0;
  for (const s of segmentos) {
    const altura = alturaDoSegmento(s, pxPorQuarto);
    if (minutos <= s.inicio) return y;
    if (minutos < s.fim) return y + ((minutos - s.inicio) / (s.fim - s.inicio)) * altura;
    y += altura;
  }
  return y;
}

export type Faixa = { faixa: number; faixas: number };

/**
 * Distribui atendimentos sobrepostos da mesma coluna em faixas lado a lado.
 * Retorna, para cada item (na ordem recebida), a faixa e o total de faixas do
 * seu grupo de sobreposição.
 */
export function distribuirEmFaixas(itens: Intervalo[]): Faixa[] {
  const ordem = itens.map((_, i) => i).sort((a, b) => itens[a].inicio - itens[b].inicio || itens[b].fim - itens[a].fim);
  const resultado: Faixa[] = new Array(itens.length);

  let grupo: number[] = [];
  let fimDasFaixas: number[] = [];
  let fimDoGrupo = -Infinity;

  const fecharGrupo = () => {
    for (const i of grupo) resultado[i].faixas = fimDasFaixas.length;
    grupo = [];
    fimDasFaixas = [];
  };

  for (const i of ordem) {
    const { inicio, fim } = itens[i];
    if (inicio >= fimDoGrupo) fecharGrupo();
    let faixa = fimDasFaixas.findIndex((f) => f <= inicio);
    if (faixa === -1) faixa = fimDasFaixas.push(fim) - 1;
    else fimDasFaixas[faixa] = fim;
    resultado[i] = { faixa, faixas: 0 };
    grupo.push(i);
    fimDoGrupo = Math.max(fimDoGrupo, fim);
  }
  fecharGrupo();
  return resultado;
}
