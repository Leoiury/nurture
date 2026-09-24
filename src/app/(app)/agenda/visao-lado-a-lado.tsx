"use client";

// Visão lado a lado: a semana inteira numa tela. Cada dia é um bloco horizontal
// com uma subcoluna por profissional; o eixo de horários é comum a todos os dias.

import Link from "next/link";
import { useMemo } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import { alturaDoSegmento, montarSegmentos, posicaoY, type Segmento } from "@/lib/agenda/layout";
import { diaDoMes, formatarHora, nomeCurtoDoDia } from "@/lib/agenda/tempo";
import {
  FUNDO_DA_HORA,
  HORARIO_PADRAO,
  corDoPlano,
  descricaoDoAtendimento,
  escalaParaCaber,
  fundoDoCard,
  geometriaDoCard,
  horasExpandidas,
  iniciais,
  type Posicionado,
} from "./comum";

// A escala vertical se ajusta para o expediente (08–18) caber na altura visível.
const ESCALA = { padrao: 12, min: 8, max: 26 };
// Com zoom, as subcolunas encolhem até este mínimo antes de a grade rolar na horizontal.
const LARGURA_MIN_SUBCOLUNA = 30;
const CARD = { min: 26, max: 140 };
const LARGURA_EIXO = 48;
const ALTURA_CABECALHO = 60;
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
  /** Altura visível do quadro da agenda, em px. */
  alturaVisivel: number | null;
};

export function VisaoLadoALado({ dias, hoje, colunas, visiveis, porColuna, compactar, expandidos, aoExpandir, aoAbrir, sufixoUrl, alturaVisivel }: Props) {
  const px = escalaParaCaber(alturaVisivel && alturaVisivel - ALTURA_CABECALHO - 8, ESCALA);
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
              <Link href={`/agenda?dia=${dia}${sufixoUrl}`} title="Abrir o dia" className="group flex flex-1 items-center justify-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{nomeCurtoDoDia(dia)}</span>
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition ${
                    ehHoje ? "bg-accent text-white" : "group-hover:bg-black/5"
                  }`}
                >
                  {diaDoMes(dia)}
                </span>
                <span className="text-xs text-muted">{total}</span>
              </Link>
              <div className="flex px-0.5 pb-1.5">
                {colunas.map((p) => (
                  <div key={p.id} className="flex min-w-0 flex-1 justify-center" title={p.nome}>
                    <span className="flex size-5 items-center justify-center rounded-full bg-black/[0.04] text-[9px] font-semibold text-muted">
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
                    className={s.compacto ? "flex items-center" : i > 0 ? "border-t border-[var(--grid-hour)]" : ""}
                    style={{ height: alturaDoSegmento(s, px), backgroundImage: s.compacto ? undefined : FUNDO_DA_HORA }}
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
        ...geometriaDoCard(a.faixa, a.faixas, CARD.min, CARD.max),
        background: fundoDoCard(cor),
        boxShadow: `inset 3px 0 0 ${cor}`,
      }}
    >
      <span className={`block truncate pt-0.5 pr-0.5 pl-[6px] text-[11px] leading-tight font-medium ${desmarcado ? "line-through" : ""}`}>
        {a.paciente?.split(" ")[0] ?? "—"}
      </span>
      {/* Horário de início, quando o card tem altura para uma segunda linha. */}
      {altura >= 30 && <span className="block truncate pr-0.5 pl-[6px] text-[10px] leading-tight tabular-nums text-muted">{formatarHora(a.inicio)}</span>}
    </button>
  );
}
