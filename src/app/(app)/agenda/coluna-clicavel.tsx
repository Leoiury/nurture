"use client";

// Coluna de um profissional num dia: um horário vazio abre o formulário de novo
// atendimento já preenchido (profissional, dia, horário). Para evitar marcações
// acidentais: com o mouse, Shift/Ctrl + clique (a prévia aparece com a tecla
// pressionada); no toque, segurar o dedo sobre o horário. Clicar numa faixa
// compactada a expande.

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { encaixar, minutosNaPosicao, posicaoY, type Segmento } from "@/lib/agenda/layout";
import { formatarHora } from "@/lib/agenda/tempo";
import { TEMPO_DE_TOQUE_LONGO, TOLERANCIA_DO_TOQUE, comModificador, useArraste } from "./arraste";

export type NovoNoHorario = { data: string; hora: string; profissionalId: string };

type Props = {
  dia: string;
  profissionalId: string;
  segmentos: Segmento[];
  px: number;
  aoExpandir: (s: Segmento) => void;
  aoCriar: (novo: NovoNoHorario) => void;
  /** Visão compacta (lado a lado): prévia sem texto. */
  compacta?: boolean;
  className?: string;
  children: ReactNode;
};

const DURACAO_DA_PREVIA = 45;
export const DICA_MARCAR = "Para marcar neste horário, segure Shift ou Ctrl e clique.";

export function ColunaClicavel({ dia, profissionalId, segmentos, px, aoExpandir, aoCriar, compacta, className = "", children }: Props) {
  const [previa, setPrevia] = useState<number | null>(null);
  const { estado: arraste, registrarColuna, modificador, dica } = useArraste();
  const chave = `${dia}|${profissionalId}`;
  // Toque em andamento sobre um horário vazio (segurando para marcar).
  const [segurando, setSegurando] = useState(false);
  const toque = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const ultimoPonteiro = useRef<string>("mouse");

  // Geometria da coluna, para o arraste converter a posição do ponteiro em horário.
  useEffect(() => {
    registrarColuna(chave, { segmentos, px });
    return () => registrarColuna(chave, null);
  }, [chave, segmentos, px, registrarColuna]);

  useEffect(() => () => clearTimeout(toque.current?.timer), []);

  // Destino do card sendo arrastado, se for esta coluna.
  const destino =
    arraste?.ativo && arraste.alvo?.dia === dia && arraste.alvo.profissionalId === profissionalId ? arraste.alvo.minuto : null;
  const duracaoArrastada = arraste ? arraste.atendimento.fim - arraste.atendimento.inicio : 0;

  function posicao(e: MouseEvent<HTMLDivElement>) {
    // Sobre um card, quem responde é o card.
    if ((e.target as HTMLElement).closest("button[data-atendimento]")) return null;
    return minutosNaPosicao(e.clientY - e.currentTarget.getBoundingClientRect().top, segmentos, px);
  }

  function soltarToque() {
    clearTimeout(toque.current?.timer);
    toque.current = null;
    setSegurando(false);
    setPrevia(null);
  }

  const mostrarPrevia = previa !== null && !arraste?.ativo && (modificador || segurando);

  return (
    <div
      data-coluna={chave}
      className={`pointer-events-auto select-none [-webkit-touch-callout:none] ${modificador ? "cursor-cell" : ""} ${className}`}
      onPointerDown={(e) => {
        ultimoPonteiro.current = e.pointerType;
        if (e.pointerType === "mouse") return;
        const p = posicao(e);
        if (!p || p.segmento.compacto) return;
        const minuto = encaixar(p.minutos);
        clearTimeout(toque.current?.timer);
        toque.current = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            soltarToque();
            navigator.vibrate?.(15);
            aoCriar({ data: dia, hora: formatarHora(minuto), profissionalId });
          }, TEMPO_DE_TOQUE_LONGO),
        };
        setSegurando(true);
        setPrevia(minuto);
      }}
      onPointerMove={(e) => {
        ultimoPonteiro.current = e.pointerType; // aparelhos com mouse e toque
        const t = toque.current;
        if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TOLERANCIA_DO_TOQUE) soltarToque(); // rolando a tela
      }}
      onPointerUp={() => toque.current && soltarToque()}
      onPointerCancel={() => toque.current && soltarToque()}
      onContextMenu={(e) => {
        if (toque.current || ultimoPonteiro.current !== "mouse") e.preventDefault();
      }}
      onMouseMove={(e) => {
        if (ultimoPonteiro.current !== "mouse") return;
        if (arraste?.ativo) return setPrevia(null);
        const p = posicao(e);
        const minuto = p && !p.segmento.compacto ? encaixar(p.minutos) : null;
        if (minuto !== previa) setPrevia(minuto);
      }}
      onMouseLeave={() => !toque.current && setPrevia(null)}
      onClick={(e) => {
        const p = posicao(e);
        if (!p) return;
        if (p.segmento.compacto) return aoExpandir(p.segmento);
        if (ultimoPonteiro.current !== "mouse") return; // no toque, marca segurando o dedo
        if (!comModificador(e)) return dica(DICA_MARCAR);
        aoCriar({ data: dia, hora: formatarHora(encaixar(p.minutos)), profissionalId });
      }}
    >
      {destino !== null && arraste && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded-lg border-2 border-accent bg-accent-soft/90 px-2 pt-0.5 text-[11px] font-medium text-accent shadow-lg"
          style={{
            top: posicaoY(destino, segmentos, px) + 1,
            height: Math.max(posicaoY(destino + duracaoArrastada, segmentos, px) - posicaoY(destino, segmentos, px) - 2, 12),
          }}
        >
          {!compacta && `${formatarHora(destino)} · ${arraste.atendimento.paciente ?? ""}`}
        </div>
      )}
      {mostrarPrevia && (
        <div
          aria-hidden
          data-previa-novo
          className={`pointer-events-none absolute inset-x-1 overflow-hidden rounded-lg border border-dashed border-accent/60 bg-accent-soft/60 text-accent ${
            compacta ? "" : "px-2 pt-0.5 text-[11px] font-medium"
          } ${segurando ? "animate-pulse" : ""}`}
          style={{ top: posicaoY(previa, segmentos, px) + 1, height: Math.max(posicaoY(previa + DURACAO_DA_PREVIA, segmentos, px) - posicaoY(previa, segmentos, px) - 2, 10) }}
        >
          {!compacta && (segurando ? `Segure… ${formatarHora(previa)}` : `+ ${formatarHora(previa)}`)}
        </div>
      )}
      {children}
    </div>
  );
}
