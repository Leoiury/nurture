// Busca de horários livres para um novo atendimento: dentro da escala de cada
// profissional (sem escala cadastrada, o expediente padrão), fora dos horários ocupados.

import { EXPEDIENTE_PADRAO, type Intervalo } from "./escala";

export { EXPEDIENTE_PADRAO, type Intervalo };

export type Ocupacao = Intervalo & { data: string };

export type HorarioLivre = { data: string; inicio: number; profissionalIds: string[] };

type Busca = {
  dias: string[]; // AAAA-MM-DD, já sem fins de semana, feriados e recessos
  duracao: number;
  /** Cada grupo precisa estar todo livre: [[a, b]] = a e b juntos; [[a], [b]] = a ou b. */
  grupos: string[][];
  /** Ocupação por profissional (e "paciente", se houver) — atendimentos não desmarcados. */
  ocupacao: Map<string, Ocupacao[]>;
  /** Ocupação do paciente, que vale para qualquer grupo. */
  ocupacaoDoPaciente?: Ocupacao[];
  /** Não sugerir antes deste instante (data de hoje + minutos agora). */
  agora?: { data: string; minutos: number };
  /** Horário de trabalho do grupo no dia (todos juntos). Padrão: o expediente padrão. */
  expedienteDo?: (grupo: string[], data: string) => Intervalo[];
  /** Máximo de sugestões por turno (manhã até 12h, tarde depois), por dia e grupo. */
  limitePorPeriodo?: number;
};

const livreEm = (ocupados: Ocupacao[] | undefined, data: string, ini: number, fim: number) =>
  !ocupados?.some((o) => o.data === data && o.inicio < fim && o.fim > ini);

/**
 * Horários em que todos os profissionais de um grupo (e o paciente) estão livres.
 * Dentro de cada intervalo livre, os horários vêm em sequência de `duracao`
 * (ex.: 13:00, 13:45, 14:30 para 45 min), começando em múltiplos de 15 min.
 */
export function horariosLivres(b: Busca): HorarioLivre[] {
  const limite = b.limitePorPeriodo ?? 4;
  const resultado: HorarioLivre[] = [];

  for (const data of b.dias) {
    for (const grupo of b.grupos) {
      const expediente = b.expedienteDo ? b.expedienteDo(grupo, data) : EXPEDIENTE_PADRAO;
      const porTurno = [0, 0]; // manhã, tarde
      for (const bloco of expediente) {
        let t = bloco.inicio;
        while (t + b.duracao <= bloco.fim) {
          const turno = t < 12 * 60 ? 0 : 1;
          if (porTurno[turno] >= limite) {
            // Turno cheio: pula para a tarde (ou encerra o bloco).
            if (turno === 0 && bloco.fim > 12 * 60) {
              t = 12 * 60;
              continue;
            }
            break;
          }
          const passou = b.agora && (data < b.agora.data || (data === b.agora.data && t < b.agora.minutos));
          const livre =
            !passou &&
            grupo.every((id) => livreEm(b.ocupacao.get(id), data, t, t + b.duracao)) &&
            livreEm(b.ocupacaoDoPaciente, data, t, t + b.duracao);
          if (livre) {
            resultado.push({ data, inicio: t, profissionalIds: grupo });
            porTurno[turno]++;
            t += b.duracao;
            t = Math.ceil(t / 15) * 15;
          } else {
            t += 15;
          }
        }
      }
    }
  }
  return resultado.sort((x, y) => x.data.localeCompare(y.data) || x.inicio - y.inicio);
}

/** Todas as ordens possíveis de uma lista (a original primeiro). */
export function permutacoes<T>(lista: T[]): T[][] {
  if (lista.length <= 1) return [lista];
  return lista.flatMap((x, i) => permutacoes([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [x, ...resto]));
}

const dentroDe = (expediente: Intervalo[], ini: number, fim: number) => expediente.some((e) => e.inicio <= ini && fim <= e.fim);

/**
 * Horários em sequência: um atendimento de `duracao` com cada profissional do grupo,
 * colados um no outro, em qualquer ordem que caiba na escala e na agenda de cada um.
 * O paciente precisa estar livre do começo do primeiro ao fim do último.
 * `profissionalIds` vem na ordem dos atendimentos.
 */
export function horariosEmSequencia(b: Busca): HorarioLivre[] {
  const limite = b.limitePorPeriodo ?? 4;
  const resultado: HorarioLivre[] = [];

  for (const data of b.dias) {
    for (const grupo of b.grupos) {
      const expediente = new Map(grupo.map((id) => [id, b.expedienteDo ? b.expedienteDo([id], data) : EXPEDIENTE_PADRAO]));
      const todos = [...expediente.values()].flat();
      if (todos.length === 0) continue;
      const total = b.duracao * grupo.length;
      const ordens = permutacoes(grupo);
      const porTurno = [0, 0]; // manhã, tarde
      const fimDoDia = Math.max(...todos.map((e) => e.fim));
      let t = Math.ceil(Math.min(...todos.map((e) => e.inicio)) / 15) * 15;
      while (t + total <= fimDoDia) {
        const turno = t < 12 * 60 ? 0 : 1;
        if (porTurno[turno] >= limite) {
          if (turno === 0) {
            t = Math.max(t + 15, 12 * 60);
            continue;
          }
          break;
        }
        const passou = b.agora && (data < b.agora.data || (data === b.agora.data && t < b.agora.minutos));
        const ordem =
          !passou && livreEm(b.ocupacaoDoPaciente, data, t, t + total)
            ? ordens.find((o) =>
                o.every((id, i) => {
                  const ini = t + i * b.duracao;
                  return dentroDe(expediente.get(id)!, ini, ini + b.duracao) && livreEm(b.ocupacao.get(id), data, ini, ini + b.duracao);
                }),
              )
            : undefined;
        if (ordem) {
          resultado.push({ data, inicio: t, profissionalIds: ordem });
          porTurno[turno]++;
          t = Math.ceil((t + b.duracao) / 15) * 15;
        } else {
          t += 15;
        }
      }
    }
  }
  return resultado.sort((x, y) => x.data.localeCompare(y.data) || x.inicio - y.inicio);
}

/** Horários de início de `n` atendimentos colados ("09:00", 45 min, 2 → 09:00 e 09:45); null se passar da meia-noite. */
export function horariosDaSequencia(hora: string, duracao: number, n: number): string[] | null {
  const inicio = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  if (Number.isNaN(inicio) || inicio + duracao * n > 24 * 60) return null;
  return Array.from({ length: n }, (_, i) => {
    const m = inicio + i * duracao;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });
}
