"use client";

// Visão lado a lado: a semana inteira numa tela. Cada dia é um bloco horizontal
// com uma subcoluna por profissional; o eixo de horários é comum a todos os dias.

import Link from "next/link";
import { useMemo } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import { alturaDoSegmento, montarSegmentos, posicaoY, type Segmento } from "@/lib/agenda/layout";
import { diaDoMes, formatarHora, nomeCurtoDoDia } from "@/lib/agenda/tempo";
import {
  HORARIO_PADRAO,
  corDoPlano,
  descricaoDoAtendimento,
  fundoDoCard,
  horasExpandidas,
  iniciais,
  type Posicionado,
} from "./comum";

const PX_POR_QUARTO = 12;
const LARGURA_MIN_SUBCOLUNA = 36;
const LARGURA_EIXO = 52;
const ALTURA_CABECALHO = 84;
const ESPACO_ENTRE_DIAS = 10;
const ESCOPO = "*"; // horas expandidas valem para a semana toda

type Props = {
  dias: string[];
  hoje: string;
  colunas: ProfissionalAgenda[];
  visiveis: AtendimentoAgenda[];
  porColuna: Map<string, Posicionado[]>;
  compactar: boolean;
  expandidos: Set<string>;
  aoExpandir: (escopo: string, s: Segmento) => void;
  aoAbrir: (id: string) => void;
  sufixoUrl: string;
};

export function VisaoLadoALado({ dias, hoje, colunas, visiveis, porColuna, compactar, expandidos, aoExpandir, aoAbrir, sufixoUrl }: Props) {
  const px = PX_POR_QUARTO;
  const segmentos = useMemo(
    () =>
      montarSegmentos(visiveis, {
        inicioPadrao: HORARIO_PADRAO.inicio,
        fimPadrao: HORARIO_PADRAO.fim,
        compactar,
        expandidos: horasExpandidas(expandidos, ESCOPO),
      }),
    [visiveis, compactar, expandidos],
  );
  const altura = segmentos.reduce((soma, s) => soma + alturaDoSegmento(s, px), 0);
  const nColunas = Math.max(colunas.length, 1);
  const larguraMinima = LARGURA_EIXO + dias.length * (nColunas * LARGURA_MIN_SUBCOLUNA + ESPACO_ENTRE_DIAS);

  return (
    <div className="flex" style={{ minWidth: larguraMinima }}>
      {/* Eixo de horários */}
      <div className="sticky left-0 z-20 shrink-0 bg-surface" style={{ width: LARGURA_EIXO }}>
        <div className="sticky top-0 z-10 bg-surface" style={{ height: ALTURA_CABECALHO }} />
        {segmentos.map((s, i) =>
          s.compacto ? (
            <button
              key={s.inicio}
              type="button"
              onClick={() => aoExpandir(ESCOPO, s)}
              title={`Sem atendimentos das ${formatarHora(s.inicio)} às ${formatarHora(s.fim)}. Clique para expandir.`}
              className="block w-full pr-2 text-right text-[10px] leading-none tabular-nums text-muted/70 hover:text-accent"
              style={{ height: alturaDoSegmento(s, px) }}
            >
              {s.inicio / 60}–{s.fim / 60}h
            </button>
          ) : (
            <div key={s.inicio} className="relative" style={{ height: alturaDoSegmento(s, px) }}>
              <span className={`absolute right-2 text-[11px] tabular-nums text-muted ${i === 0 || segmentos[i - 1].compacto ? "top-0.5" : "-top-2"}`}>
                {formatarHora(s.inicio)}
              </span>
            </div>
          ),
        )}
      </div>

      {/* Dias */}
      {dias.map((dia) => {
        const ehHoje = dia === hoje;
        const total = visiveis.filter((a) => a.data === dia && a.status !== "desmarcado").length;
        return (
          <section
            key={dia}
            aria-label={dia}
            className={`flex min-w-0 flex-1 flex-col rounded-2xl ${ehHoje ? "bg-accent-soft/40" : ""}`}
            style={{ marginRight: ESPACO_ENTRE_DIAS }}
          >
            {/* Cabeçalho do dia */}
            <div className={`sticky top-0 z-10 flex flex-col rounded-t-2xl ${ehHoje ? "bg-[color-mix(in_srgb,var(--accent-soft)_40%,white)]" : "bg-surface"}`} style={{ height: ALTURA_CABECALHO }}>
              <Link href={`/agenda?dia=${dia}${sufixoUrl}`} title="Abrir o dia" className="group flex flex-1 items-center justify-center gap-2 pt-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{nomeCurtoDoDia(dia)}</span>
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-base font-semibold tabular-nums transition ${
                    ehHoje ? "bg-accent text-white" : "group-hover:bg-black/5"
                  }`}
                >
                  {diaDoMes(dia)}
                </span>
                <span className="text-xs text-muted">{total}</span>
              </Link>
              <div className="flex px-0.5 pb-2">
                {colunas.map((p) => (
                  <div key={p.id} className="flex min-w-0 flex-1 justify-center" title={p.nome}>
                    <span className="flex size-6 items-center justify-center rounded-full bg-black/[0.04] text-[10px] font-semibold text-muted">
                      {iniciais(p.nome)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Corpo do dia */}
            <div className="relative" style={{ height: altura }}>
              <div className="absolute inset-0" aria-hidden>
                {segmentos.map((s, i) => (
                  <div
                    key={s.inicio}
                    className={
                      s.compacto
                        ? "flex items-center"
                        : i > 0 && !segmentos[i - 1].compacto
                          ? "border-t border-black/[0.06]"
                          : ""
                    }
                    style={{
                      height: alturaDoSegmento(s, px),
                      backgroundImage: s.compacto
                        ? undefined
                        : `repeating-linear-gradient(to bottom, transparent 0 ${px - 1}px, rgba(0,0,0,0.022) ${px - 1}px ${px}px)`,
                    }}
                  >
                    {s.compacto && <span className="mx-2 h-px flex-1 border-t border-dashed border-black/10" />}
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-0 flex px-0.5">
                {colunas.map((p) => (
                  <div key={p.id} className="relative min-w-0 flex-1 px-px">
                    {(porColuna.get(`${dia}|${p.id}`) ?? []).map((a) => (
                      <CardCompacto
                        key={a.id}
                        atendimento={a}
                        top={posicaoY(a.inicio, segmentos, px)}
                        altura={posicaoY(a.fim, segmentos, px) - posicaoY(a.inicio, segmentos, px)}
                        profissional={p.nome}
                        aoAbrir={() => aoAbrir(a.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

type CardProps = {
  atendimento: Posicionado;
  top: number;
  altura: number;
  profissional: string;
  aoAbrir: () => void;
};

function CardCompacto({ atendimento: a, top, altura, profissional, aoAbrir }: CardProps) {
  const cor = corDoPlano(a);
  const desmarcado = a.status === "desmarcado";
  const descricao = descricaoDoAtendimento(a, profissional);

  return (
    <button
      type="button"
      onClick={aoAbrir}
      title={descricao}
      aria-label={descricao}
      className={`pointer-events-auto absolute overflow-hidden rounded-md text-left text-foreground transition hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        desmarcado ? "opacity-50" : ""
      } ${a.status === "faltou" ? "ring-2 ring-[var(--danger)]" : ""}`}
      style={{
        top: top + 1,
        height: Math.max(altura - 2, 12),
        left: `calc(${(a.faixa / a.faixas) * 100}% + ${a.faixa > 0 ? 1 : 0}px)`,
        width: `calc(${100 / a.faixas}% - ${a.faixas > 1 ? 1 : 0}px)`,
        background: fundoDoCard(cor),
        boxShadow: `inset 3px 0 0 ${cor}`,
      }}
    >
      <span className={`block truncate pt-0.5 pr-0.5 pl-[6px] text-[10.5px] leading-tight font-medium ${desmarcado ? "line-through" : ""}`}>
        {a.paciente?.split(" ")[0] ?? "—"}
      </span>
    </button>
  );
}
