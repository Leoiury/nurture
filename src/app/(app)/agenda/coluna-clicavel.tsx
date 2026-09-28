"use client";

// Coluna de um profissional num dia: clicar num horário vazio abre o formulário
// de novo atendimento já preenchido (profissional, dia, horário). Passando o
// mouse, uma prévia mostra onde o atendimento ficaria (encaixe de 15 min).
// Clicar numa faixa compactada a expande.

import { useState, type MouseEvent, type ReactNode } from "react";
import { encaixar, minutosNaPosicao, posicaoY, type Segmento } from "@/lib/agenda/layout";
import { formatarHora } from "@/lib/agenda/tempo";

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

export function ColunaClicavel({ dia, profissionalId, segmentos, px, aoExpandir, aoCriar, compacta, className = "", children }: Props) {
  const [previa, setPrevia] = useState<number | null>(null);

  function posicao(e: MouseEvent<HTMLDivElement>) {
    // Sobre um card, quem responde é o card.
    if ((e.target as HTMLElement).closest("button[data-atendimento]")) return null;
    return minutosNaPosicao(e.clientY - e.currentTarget.getBoundingClientRect().top, segmentos, px);
  }

  return (
    <div
      className={`pointer-events-auto cursor-pointer ${className}`}
      onMouseMove={(e) => {
        const p = posicao(e);
        const minuto = p && !p.segmento.compacto ? encaixar(p.minutos) : null;
        if (minuto !== previa) setPrevia(minuto);
      }}
      onMouseLeave={() => setPrevia(null)}
      onClick={(e) => {
        const p = posicao(e);
        if (!p) return;
        if (p.segmento.compacto) return aoExpandir(p.segmento);
        aoCriar({ data: dia, hora: formatarHora(encaixar(p.minutos)), profissionalId });
      }}
    >
      {previa !== null && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-1 overflow-hidden rounded-lg border border-dashed border-accent/60 bg-accent-soft/60 text-accent ${
            compacta ? "" : "px-2 pt-0.5 text-[11px] font-medium"
          }`}
          style={{ top: posicaoY(previa, segmentos, px) + 1, height: Math.max(posicaoY(previa + DURACAO_DA_PREVIA, segmentos, px) - posicaoY(previa, segmentos, px) - 2, 10) }}
        >
          {!compacta && `+ ${formatarHora(previa)}`}
        </div>
      )}
      {children}
    </div>
  );
}
