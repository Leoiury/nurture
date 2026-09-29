"use client";

// Arrastar cards de atendimento. Os cards iniciam o arraste; as colunas se
// registram com sua geometria e mostram onde o card vai cair (encaixe de 15 min).
//
// Proteção contra mudanças acidentais:
// - mouse: só arrasta com Shift, Ctrl (ou ⌘) pressionado; sem a tecla, mostra uma dica;
// - toque: é preciso manter o dedo parado sobre o card por um instante; mexer o
//   dedo antes disso é rolagem normal da tela.

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
  toque: boolean;
  /** Mouse sem tecla modificadora: não arrasta. "avisado": a dica já foi mostrada. */
  bloqueado: false | true | "avisado";
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
  /** Shift, Ctrl ou ⌘ pressionado agora (libera arrastar e marcar com o mouse). */
  modificador: boolean;
  /** Mensagem curta explicando o gesto certo. */
  dica: (texto: string) => void;
};

const ContextoDeArraste = createContext<Contexto | null>(null);

export function useArraste(): Contexto {
  const c = useContext(ContextoDeArraste);
  if (!c) throw new Error("useArraste fora do ProvedorDeArraste");
  return c;
}

/** Tecla que libera mudanças com o mouse. */
export const comModificador = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.shiftKey || e.ctrlKey || e.metaKey;

/** Distância mínima (px) para um clique virar arraste. */
const LIMIAR = 6;
/** Toque: quanto o dedo pode se mexer enquanto segura (mais que isso é rolagem). */
export const TOLERANCIA_DO_TOQUE = 10;
/** Toque: tempo segurando para liberar o arraste / a marcação. */
export const TEMPO_DE_TOQUE_LONGO = 450;

export const DICA_ARRASTAR = "Para mover um atendimento, segure Shift ou Ctrl enquanto arrasta.";

type Props = {
  children: ReactNode;
  aoSoltar: (atendimento: AtendimentoAgenda, de: string, alvo: AlvoDoArraste) => void;
  aoDica: (texto: string) => void;
};

export function ProvedorDeArraste({ children, aoSoltar, aoDica }: Props) {
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
  const toqueLongo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aoSoltarRef = useRef(aoSoltar);
  const aoDicaRef = useRef(aoDica);
  useEffect(() => {
    aoSoltarRef.current = aoSoltar;
    aoDicaRef.current = aoDica;
  }, [aoSoltar, aoDica]);
  const dica = useCallback((texto: string) => aoDicaRef.current(texto), []);

  const registrarColuna = useCallback((chave: string, geometria: Geometria | null) => {
    if (geometria) colunas.current.set(chave, geometria);
    else colunas.current.delete(chave);
  }, []);

  const alvoEm = useCallback((x: number, y: number, e: Estado): AlvoDoArraste | null => {
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
  }, []);

  const pararToqueLongo = useCallback(() => {
    if (toqueLongo.current) clearTimeout(toqueLongo.current);
    toqueLongo.current = null;
  }, []);

  const iniciar = useCallback(
    (e: PointerEvent<HTMLElement>, atendimento: AtendimentoAgenda, de: string) => {
      const toque = e.pointerType !== "mouse";
      if (!toque && e.button !== 0) return;
      const liberado = toque || comModificador(e);
      if (!toque && liberado) e.preventDefault(); // Shift+clique não seleciona texto
      const novo: Estado = {
        atendimento,
        de,
        deslocamentoY: e.clientY - e.currentTarget.getBoundingClientRect().top,
        inicioX: e.clientX,
        inicioY: e.clientY,
        toque,
        bloqueado: !liberado,
        ativo: false,
        alvo: null,
      };
      setEstado(novo);
      if (toque) {
        if (toqueLongo.current) clearTimeout(toqueLongo.current);
        toqueLongo.current = setTimeout(() => {
          toqueLongo.current = null;
          if (estadoRef.current !== novo) return; // o dedo saiu ou rolou a tela
          navigator.vibrate?.(15);
          setEstado({ ...novo, ativo: true, alvo: alvoEm(novo.inicioX, novo.inicioY, novo) });
        }, TEMPO_DE_TOQUE_LONGO);
      }
    },
    [setEstado, alvoEm],
  );

  // Enquanto há um arraste (ou candidato a arraste), acompanha o ponteiro na janela.
  const emAndamento = estado !== null;
  useEffect(() => {
    if (!emAndamento) return;

    const mover = (ev: globalThis.PointerEvent) => {
      const e = estadoRef.current;
      if (!e) return;
      if (!e.ativo) {
        const distancia = Math.hypot(ev.clientX - e.inicioX, ev.clientY - e.inicioY);
        if (e.toque) {
          // Mexeu o dedo antes do tempo: é rolagem, não arraste.
          if (distancia > TOLERANCIA_DO_TOQUE) {
            pararToqueLongo();
            setEstado(null);
          }
          return;
        }
        if (distancia <= LIMIAR) return;
        if (e.bloqueado) {
          if (e.bloqueado !== "avisado") {
            aoDicaRef.current(DICA_ARRASTAR);
            setEstado({ ...e, bloqueado: "avisado" });
          }
          return;
        }
      }
      const alvo = alvoEm(ev.clientX, ev.clientY, e);
      const mudou = !e.ativo || alvo?.dia !== e.alvo?.dia || alvo?.profissionalId !== e.alvo?.profissionalId || alvo?.minuto !== e.alvo?.minuto;
      if (mudou) setEstado({ ...e, ativo: true, alvo });
    };
    const soltar = () => {
      const e = estadoRef.current;
      pararToqueLongo();
      setEstado(null);
      // Depois de arrastar (ou tentar arrastar sem a tecla), o clique não abre o card.
      if (!e?.ativo && e?.bloqueado !== "avisado") return;
      suprimir.current = true;
      setTimeout(() => (suprimir.current = false), 0);
      if (e.ativo && e.alvo) aoSoltarRef.current(e.atendimento, e.de, e.alvo);
    };
    const cancelarPonteiro = () => {
      pararToqueLongo();
      setEstado(null);
    };
    const cancelar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancelarPonteiro();
    };
    // Arrastando com o dedo, a tela não rola (o listener precisa ser não passivo).
    const travarRolagem = (ev: TouchEvent) => {
      if (estadoRef.current?.toque && estadoRef.current.ativo) ev.preventDefault();
    };
    // Segurar o dedo não abre o menu do navegador sobre o card.
    const semMenu = (ev: Event) => {
      if (estadoRef.current?.toque) ev.preventDefault();
    };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", cancelarPonteiro);
    window.addEventListener("keydown", cancelar);
    window.addEventListener("touchmove", travarRolagem, { passive: false });
    window.addEventListener("contextmenu", semMenu);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelarPonteiro);
      window.removeEventListener("keydown", cancelar);
      window.removeEventListener("touchmove", travarRolagem);
      window.removeEventListener("contextmenu", semMenu);
    };
  }, [emAndamento, setEstado, alvoEm, pararToqueLongo]);

  // Tecla modificadora: prévia de "novo atendimento" e cursor de arrastar.
  const [modificador, setModificador] = useState(false);
  useEffect(() => {
    const atualizar = (ev: KeyboardEvent) => setModificador(comModificador(ev));
    const soltarTudo = () => setModificador(false);
    window.addEventListener("keydown", atualizar);
    window.addEventListener("keyup", atualizar);
    window.addEventListener("blur", soltarTudo);
    return () => {
      window.removeEventListener("keydown", atualizar);
      window.removeEventListener("keyup", atualizar);
      window.removeEventListener("blur", soltarTudo);
    };
  }, []);
  useEffect(() => {
    document.body.toggleAttribute("data-modificador", modificador);
  }, [modificador]);

  // Sem seleção de texto nem cursor de texto durante o arraste.
  const arrastando = !!estado?.ativo;
  useEffect(() => {
    if (!arrastando) return;
    document.body.classList.add("select-none", "cursor-grabbing");
    return () => document.body.classList.remove("select-none", "cursor-grabbing");
  }, [arrastando]);

  const valor = useMemo<Contexto>(
    () => ({ estado, iniciar, registrarColuna, cliqueSuprimido: () => suprimir.current, modificador, dica }),
    [estado, iniciar, registrarColuna, modificador, dica],
  );
  return <ContextoDeArraste.Provider value={valor}>{children}</ContextoDeArraste.Provider>;
}
