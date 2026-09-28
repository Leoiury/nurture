"use client";

// Arrastar cards de atendimento (só com mouse; no toque, a rolagem tem prioridade
// e a mudança se faz pelo "Editar"). Os cards iniciam o arraste; as colunas se
// registram com sua geometria e mostram onde o card vai cair (encaixe de 15 min).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { AtendimentoAgenda } from "@/lib/agenda/dados";
import { minutosNaPosicao, type Segmento } from "@/lib/agenda/layout";

export type AlvoDoArraste = { dia: string; profissionalId: string; minuto: number };

type Estado = {
  atendimento: AtendimentoAgenda;
  /** Coluna (profissional) de onde o card saiu. */
  de: string;
  /** Distância do ponteiro ao topo do card, para o card acompanhar o ponteiro. */
  deslocamentoY: number;
  inicioX: number;
  inicioY: number;
  ativo: boolean;
  alvo: AlvoDoArraste | null;
};

type Geometria = { segmentos: Segmento[]; px: number };

type Contexto = {
  estado: Estado | null;
  iniciar: (e: PointerEvent<HTMLElement>, atendimento: AtendimentoAgenda, de: string) => void;
  registrarColuna: (chave: string, geometria: Geometria | null) => void;
  /** true logo após soltar um arraste: o clique que o navegador dispara depois deve ser ignorado. */
  cliqueSuprimido: () => boolean;
};

const ContextoDeArraste = createContext<Contexto | null>(null);

export function useArraste(): Contexto {
  const c = useContext(ContextoDeArraste);
  if (!c) throw new Error("useArraste fora do ProvedorDeArraste");
  return c;
}

/** Distância mínima (px) para um clique virar arraste. */
const LIMIAR = 6;

type Props = {
  children: ReactNode;
  aoSoltar: (atendimento: AtendimentoAgenda, de: string, alvo: AlvoDoArraste) => void;
};

export function ProvedorDeArraste({ children, aoSoltar }: Props) {
  const [estado, setEstadoReact] = useState<Estado | null>(null);
  // Espelho do estado para os eventos da janela lerem o valor atual sem efeitos
  // dentro de setState (o React pode executar atualizadores duas vezes).
  const estadoRef = useRef<Estado | null>(null);
  const setEstado = useCallback((novo: Estado | null) => {
    estadoRef.current = novo;
    setEstadoReact(novo);
  }, []);
  const colunas = useRef(new Map<string, Geometria>());
  const suprimir = useRef(false);
  const aoSoltarRef = useRef(aoSoltar);
  useEffect(() => {
    aoSoltarRef.current = aoSoltar;
  }, [aoSoltar]);

  const registrarColuna = useCallback((chave: string, geometria: Geometria | null) => {
    if (geometria) colunas.current.set(chave, geometria);
    else colunas.current.delete(chave);
  }, []);

  const iniciar = useCallback((e: PointerEvent<HTMLElement>, atendimento: AtendimentoAgenda, de: string) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const topo = e.currentTarget.getBoundingClientRect().top;
    setEstado({ atendimento, de, deslocamentoY: e.clientY - topo, inicioX: e.clientX, inicioY: e.clientY, ativo: false, alvo: null });
  }, [setEstado]);

  // Enquanto há um arraste (ou candidato a arraste), acompanha o ponteiro na janela.
  const emAndamento = estado !== null;
  useEffect(() => {
    if (!emAndamento) return;

    function alvoEm(x: number, y: number, e: Estado): AlvoDoArraste | null {
      const coluna = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-coluna]");
      const geometria = coluna && colunas.current.get(coluna.dataset.coluna!);
      if (!coluna || !geometria) return null;
      const [dia, profissionalId] = coluna.dataset.coluna!.split("|");
      const topo = coluna.getBoundingClientRect().top;
      const p = minutosNaPosicao(y - e.deslocamentoY - topo, geometria.segmentos, geometria.px) ?? minutosNaPosicao(y - topo, geometria.segmentos, geometria.px);
      if (!p || p.segmento.compacto) return null;
      const duracao = e.atendimento.fim - e.atendimento.inicio;
      const minuto = Math.min(Math.max(Math.round(p.minutos / 15) * 15, 0), 24 * 60 - duracao);
      return { dia, profissionalId, minuto };
    }

    const mover = (ev: globalThis.PointerEvent) => {
      const e = estadoRef.current;
      if (!e) return;
      const ativo = e.ativo || Math.hypot(ev.clientX - e.inicioX, ev.clientY - e.inicioY) > LIMIAR;
      if (!ativo) return;
      const alvo = alvoEm(ev.clientX, ev.clientY, e);
      const mudou = !e.ativo || alvo?.dia !== e.alvo?.dia || alvo?.profissionalId !== e.alvo?.profissionalId || alvo?.minuto !== e.alvo?.minuto;
      if (mudou) setEstado({ ...e, ativo, alvo });
    };
    const soltar = () => {
      const e = estadoRef.current;
      setEstado(null);
      if (!e?.ativo) return; // foi só um clique
      suprimir.current = true;
      setTimeout(() => (suprimir.current = false), 0);
      if (e.alvo) aoSoltarRef.current(e.atendimento, e.de, e.alvo);
    };
    const cancelar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setEstado(null);
    };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("keydown", cancelar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("keydown", cancelar);
    };
  }, [emAndamento, setEstado]);

  // Sem seleção de texto nem cursor de texto durante o arraste.
  const arrastando = !!estado?.ativo;
  useEffect(() => {
    if (!arrastando) return;
    document.body.classList.add("select-none", "cursor-grabbing");
    return () => document.body.classList.remove("select-none", "cursor-grabbing");
  }, [arrastando]);

  const valor = useMemo<Contexto>(
    () => ({ estado, iniciar, registrarColuna, cliqueSuprimido: () => suprimir.current }),
    [estado, iniciar, registrarColuna],
  );
  return <ContextoDeArraste.Provider value={valor}>{children}</ContextoDeArraste.Provider>;
}
