"use client";

// Por onde os painéis (novo/editar atendimento, detalhes) executam as ações.
// Por padrão, direto na agenda real; no planejamento, as ações viram operações
// do rascunho (ver planejamento.tsx).

import { createContext, useContext } from "react";
import type { Exibicao } from "@/lib/agenda/planejamento";
import { ajustarPaciente, desmarcar, editar, excluir, type AjustesDoPaciente, type Alcance, type Edicao, type Resultado } from "./actions";
import { criarAtendimentos, type NovoAtendimento, type ResultadoCriacao } from "./actions-novo-atendimento";

export type AcoesDaAgenda = {
  planejamento: boolean;
  criar: (novo: NovoAtendimento, exibicao: Exibicao) => Promise<ResultadoCriacao>;
  editar: (e: Edicao, exibicao: Exibicao) => Promise<Resultado>;
  desmarcar: (id: string, alcance: Alcance, motivo: string) => Promise<Resultado>;
  excluir: (id: string, alcance: Alcance, motivo: string) => Promise<Resultado>;
  /** Plano padrão, plano dos futuros e valores do paciente (depois de salvar um atendimento). */
  ajustar: (a: AjustesDoPaciente, exibicao: ExibicaoDoAjuste) => Promise<Resultado>;
  /** Só no planejamento: o que já foi alterado neste atendimento e como desfazer. */
  pendencias?: (id: string) => { descricoes: string[]; desfazer: () => void } | null;
};

/** Nomes para as descrições do planejamento. */
export type ExibicaoDoAjuste = { paciente: string; planoPadrao?: string | null; planoNosFuturos?: { nome: string; cor: string } | null; segmento?: string | null };

const REAIS: AcoesDaAgenda = {
  planejamento: false,
  criar: (novo) => criarAtendimentos(novo),
  editar: (e) => editar(e),
  desmarcar,
  excluir,
  ajustar: (a) => ajustarPaciente(a),
};

const ContextoDeAcoes = createContext<AcoesDaAgenda>(REAIS);

export const ProvedorDeAcoes = ContextoDeAcoes.Provider;

export function useAcoesDaAgenda(): AcoesDaAgenda {
  return useContext(ContextoDeAcoes);
}
