// Regras de recorrência dos atendimentos. As datas geradas aqui alimentam tanto a
// prévia do formulário quanto a gravação — o que aparece na prévia é o que é criado.

import { diaDaSemana, somarDias } from "./tempo";

export type Frequencia = "semanal" | "quinzenal" | "mensal";

export type FimDaSerie = { tipo: "data"; ate: string } | { tipo: "sessoes"; quantidade: number };

/** Limite de atendimentos numa série (o banco também recusa acima disso). */
export const MAXIMO_DE_SESSOES = 120;

export const ROTULO_FREQUENCIA: Record<Frequencia, string> = {
  semanal: "Toda semana",
  quinzenal: "A cada 2 semanas",
  mensal: "Todo mês",
};

const NOMES_ORDINAIS = ["1ª", "2ª", "3ª", "4ª", "5ª"];
const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Ordem do dia da semana no mês: 15/09/2026 (terça) é a 3ª terça. */
export function ordemNoMes(data: string): number {
  return Math.ceil(Number(data.slice(8, 10)) / 7);
}

/** "3ª terça do mês" — descreve a regra mensal a partir da data inicial. */
export function descricaoMensal(data: string): string {
  return `${NOMES_ORDINAIS[ordemNoMes(data) - 1]} ${NOMES_DIAS[diaDaSemana(data)]} do mês`;
}

/** N-ésimo dia da semana (0 = domingo) de um mês, ou null se não existir (ex.: 5ª terça). */
function enesimoDiaDaSemana(ano: number, mes: number, diaSemana: number, n: number): string | null {
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const deslocamento = (diaSemana - diaDaSemana(primeiro) + 7) % 7;
  const data = somarDias(primeiro, deslocamento + (n - 1) * 7);
  return Number(data.slice(5, 7)) === mes ? data : null;
}

/**
 * Datas (AAAA-MM-DD) da série, começando pela data inicial.
 * Mensal mantém o mesmo dia da semana e a mesma ordem no mês; meses sem essa
 * ocorrência (ex.: sem 5ª terça) são pulados.
 */
export function datasDaSerie(inicio: string, frequencia: Frequencia, fim: FimDaSerie): string[] {
  const limite = fim.tipo === "sessoes" ? Math.min(fim.quantidade, MAXIMO_DE_SESSOES) : MAXIMO_DE_SESSOES;
  const cabe = (data: string) => fim.tipo === "sessoes" || data <= fim.ate;
  const datas: string[] = [];

  if (frequencia === "mensal") {
    const ordem = ordemNoMes(inicio);
    const diaSemana = diaDaSemana(inicio);
    let ano = Number(inicio.slice(0, 4));
    let mes = Number(inicio.slice(5, 7));
    // Guarda contra laço infinito: no máximo 10 anos de meses.
    for (let i = 0; i < 120 && datas.length < limite; i++) {
      const data = enesimoDiaDaSemana(ano, mes, diaSemana, ordem);
      if (data) {
        if (!cabe(data)) break;
        datas.push(data);
      }
      mes++;
      if (mes > 12) {
        mes = 1;
        ano++;
      }
    }
    return datas;
  }

  const passo = frequencia === "semanal" ? 7 : 14;
  for (let data = inicio; datas.length < limite && cabe(data); data = somarDias(data, passo)) {
    datas.push(data);
  }
  return datas;
}

/**
 * Datas da série pulando dias bloqueados (feriados e recessos). Com fim por número
 * de sessões, a quantidade é mantida: as puladas são repostas no fim da série.
 * `candidatas` devolve a lista ampliada usada para isso — útil para saber até
 * que data consultar os feriados.
 */
export function candidatasDaSerie(inicio: string, frequencia: Frequencia, fim: FimDaSerie): string[] {
  if (fim.tipo === "data") return datasDaSerie(inicio, frequencia, fim);
  const folga = Math.min(fim.quantidade * 2 + 4, MAXIMO_DE_SESSOES);
  return datasDaSerie(inicio, frequencia, { tipo: "sessoes", quantidade: folga });
}

export function datasSemBloqueios(
  inicio: string,
  frequencia: Frequencia,
  fim: FimDaSerie,
  bloqueado: (data: string) => boolean,
): string[] {
  const livres = candidatasDaSerie(inicio, frequencia, fim).filter((d) => !bloqueado(d));
  return fim.tipo === "sessoes" ? livres.slice(0, Math.min(fim.quantidade, MAXIMO_DE_SESSOES)) : livres;
}
