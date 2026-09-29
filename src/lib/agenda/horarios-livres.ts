// Busca de horários livres para um novo atendimento.
//
// PROVISÓRIO: usa um expediente padrão igual para todos (seg–sex, 08–12 e 13–18)
// até as jornadas de trabalho por profissional existirem (próxima sprint).

export type Intervalo = { inicio: number; fim: number }; // minutos desde 00:00

export const EXPEDIENTE_PADRAO: Intervalo[] = [
  { inicio: 8 * 60, fim: 12 * 60 },
  { inicio: 13 * 60, fim: 18 * 60 },
];

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
  expediente?: Intervalo[];
  /** Máximo de sugestões por período do expediente (manhã, tarde), por dia e grupo. */
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
  const expediente = b.expediente ?? EXPEDIENTE_PADRAO;
  const limite = b.limitePorPeriodo ?? 4;
  const resultado: HorarioLivre[] = [];

  for (const data of b.dias) {
    for (const grupo of b.grupos) {
      for (const bloco of expediente) {
        let noPeriodo = 0;
        let t = bloco.inicio;
        while (t + b.duracao <= bloco.fim && noPeriodo < limite) {
          const passou = b.agora && (data < b.agora.data || (data === b.agora.data && t < b.agora.minutos));
          const livre =
            !passou &&
            grupo.every((id) => livreEm(b.ocupacao.get(id), data, t, t + b.duracao)) &&
            livreEm(b.ocupacaoDoPaciente, data, t, t + b.duracao);
          if (livre) {
            resultado.push({ data, inicio: t, profissionalIds: grupo });
            noPeriodo++;
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
