"use client";

// Visão empilhada: colunas = profissionais; os dias ficam um abaixo do outro,
// cada um com suas próprias horas.

import Link from "next/link";
import { useMemo } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import { alturaDoSegmento, montarSegmentos, posicaoY, type Segmento } from "@/lib/agenda/layout";
import { formatarHora, nomeLongoDoDia } from "@/lib/agenda/tempo";
import {
  FUNDO_DA_HORA,
  FUNDO_DA_HORA_AMPLIADA,
  HORARIO_PADRAO,
  corDoPlano,
  descricaoDoAtendimento,
  escalaParaCaber,
  fundoDoCard,
  geometriaDoCard,
  horarioDoAtendimento,
  horasExpandidas,
  iniciais,
  type Posicionado,
} from "./comum";

type Modo = "semana" | "dia";

// A escala vertical se ajusta para o expediente de um dia caber na altura visível.
const ESCALA = { padrao: 14, min: 9, max: 30 };
// Visão ampliada: escala fixa e alta (112 px por hora), sem ajuste à tela.
const PX_AMPLIADA = 28;
// Com zoom, as colunas encolhem até este mínimo antes de a grade rolar na horizontal.
const LARGURA_MIN_COLUNA = 132;
const CARD = { min: 72, max: 280 };
const LARGURA_EIXO = 52;
const ALTURA_CABECALHO_PROF = 40;
const ALTURA_CABECALHO_DIA = 32;

type Props = {
  modo: Modo;
  dias: string[];
  hoje: string;
  colunas: ProfissionalAgenda[];
  visiveis: AtendimentoAgenda[];
  porColuna: Map<string, Posicionado[]>;
  compactar: boolean;
  expandidos: Set<string>;
  aoExpandir: (escopo: string, s: Segmento) => void;
  aoAbrir: (id: string) => void;
  /** Sufixo de URL que preserva a visão escolhida ao abrir um dia. */
  sufixoUrl: string;
  /** Altura visível do quadro da agenda, em px. */
  alturaVisivel: number | null;
  /** Linhas e cards maiores, com escala fixa (ignora o ajuste para 08–18 caber na tela). */
  ampliada: boolean;
};

export function VisaoEmpilhada({ modo, dias, hoje, colunas, visiveis, porColuna, compactar, expandidos, aoExpandir, aoAbrir, sufixoUrl, alturaVisivel, ampliada }: Props) {
  const px = ampliada
    ? PX_AMPLIADA
    : escalaParaCaber(alturaVisivel && alturaVisivel - ALTURA_CABECALHO_PROF - ALTURA_CABECALHO_DIA - 8, ESCALA);

  // Cada dia tem seus próprios segmentos: as horas vazias de um dia não dependem dos outros.
  const segmentosPorDia = useMemo(() => {
    const m = new Map<string, Segmento[]>();
    for (const dia of dias) {
      m.set(
        dia,
        montarSegmentos(
          visiveis.filter((a) => a.data === dia),
          { inicioPadrao: HORARIO_PADRAO.inicio, fimPadrao: HORARIO_PADRAO.fim, compactar, expandidos: horasExpandidas(expandidos, dia) },
        ),
      );
    }
    return m;
  }, [dias, visiveis, compactar, expandidos]);

  return (
    <div style={{ minWidth: LARGURA_EIXO + Math.max(colunas.length, 1) * LARGURA_MIN_COLUNA }}>
      {/* Profissionais */}
      <div className="sticky top-0 z-30 flex border-b border-black/[0.06] bg-surface/95 backdrop-blur" style={{ height: ALTURA_CABECALHO_PROF }}>
        <div className="sticky left-0 z-10 shrink-0 bg-surface/95" style={{ width: LARGURA_EIXO }} />
        {colunas.map((p) => (
          <div key={p.id} className="flex min-w-0 flex-1 items-center gap-2 px-2" title={p.especialidade ? `${p.nome} · ${p.especialidade}` : p.nome}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
              {iniciais(p.nome)}
            </span>
            <span className="truncate text-xs font-medium">{p.nome}</span>
          </div>
        ))}
        {colunas.length === 0 && <div className="flex flex-1 items-center px-4 text-sm text-muted">Nenhum profissional selecionado.</div>}
      </div>

      {dias.map((dia) => (
        <Dia
          key={dia}
          dia={dia}
          ehHoje={dia === hoje}
          modo={modo}
          px={px}
          segmentos={segmentosPorDia.get(dia) ?? []}
          colunas={colunas}
          porColuna={porColuna}
          total={visiveis.filter((a) => a.data === dia && a.status !== "desmarcado").length}
          aoExpandir={(s) => aoExpandir(dia, s)}
          aoAbrir={aoAbrir}
          sufixoUrl={sufixoUrl}
          ampliada={ampliada}
        />
      ))}
    </div>
  );
}

type DiaProps = {
  dia: string;
  ehHoje: boolean;
  modo: Modo;
  px: number;
  segmentos: Segmento[];
  colunas: ProfissionalAgenda[];
  porColuna: Map<string, Posicionado[]>;
  total: number;
  aoExpandir: (s: Segmento) => void;
  aoAbrir: (id: string) => void;
  sufixoUrl: string;
  ampliada: boolean;
};

function Dia({ dia, ehHoje, modo, px, segmentos, colunas, porColuna, total, aoExpandir, aoAbrir, sufixoUrl, ampliada }: DiaProps) {
  const altura = segmentos.reduce((soma, s) => soma + alturaDoSegmento(s, px), 0);
  const titulo = nomeLongoDoDia(dia);

  return (
    <section aria-label={dia} className="snap-start border-b border-black/[0.06] last:border-b-0" style={{ scrollMarginTop: ALTURA_CABECALHO_PROF }}>
      <div
        className="sticky z-20 flex items-center border-b border-black/[0.04] bg-surface/95 backdrop-blur"
        style={{ top: ALTURA_CABECALHO_PROF, height: ALTURA_CABECALHO_DIA }}
      >
        <div className="sticky left-0 flex items-center gap-2 px-3">
          <span className={`size-2 rounded-full ${ehHoje ? "bg-accent" : "bg-black/15"}`} aria-hidden />
          {modo === "semana" ? (
            <Link href={`/agenda?dia=${dia}${sufixoUrl}`} className="text-[13px] font-semibold first-letter:uppercase hover:text-accent" title="Abrir só este dia">
              {titulo}
            </Link>
          ) : (
            <span className="text-[13px] font-semibold first-letter:uppercase">{titulo}</span>
          )}
          {ehHoje && <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-medium text-white">Hoje</span>}
          <span className="text-xs text-muted">
            {total} atendimento{total === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex" style={{ height: altura }}>
        {/* Horários */}
        <div className="sticky left-0 z-10 shrink-0 bg-surface" style={{ width: LARGURA_EIXO }}>
          {segmentos.map((s, i) =>
            s.compacto ? (
              <button
                key={s.inicio}
                type="button"
                onClick={() => aoExpandir(s)}
                title={`Sem atendimentos das ${formatarHora(s.inicio)} às ${formatarHora(s.fim)}. Clique para expandir.`}
                className="block w-full pr-2 text-right text-[10px] leading-none text-muted/70 hover:text-accent"
                style={{ height: alturaDoSegmento(s, px) }}
              >
                ⋯
              </button>
            ) : (
              <div key={s.inicio} className="relative" style={{ height: alturaDoSegmento(s, px) }}>
                <span className={`absolute right-2 text-[11px] tabular-nums text-muted ${i === 0 || segmentos[i - 1].compacto ? "top-1" : "-top-2"}`}>
                  {formatarHora(s.inicio)}
                </span>
                {/* Na ampliada há altura para marcar também a meia hora. */}
                {ampliada && (
                  <span className="absolute top-1/2 right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted/60">{formatarHora(s.inicio + 30)}</span>
                )}
              </div>
            ),
          )}
        </div>

        {/* Colunas dos profissionais */}
        <div className="relative flex-1">
          <LinhasDeFundo segmentos={segmentos} px={px} aoExpandir={aoExpandir} ampliada={ampliada} />
          <div className="pointer-events-none absolute inset-0 flex">
            {colunas.map((p) => (
              <div key={p.id} className="relative min-w-0 flex-1 px-1">
                <div className="relative h-full">
                  {(porColuna.get(`${dia}|${p.id}`) ?? []).map((a) => (
                    <Card
                      key={a.id}
                      atendimento={a}
                      modo={modo}
                      top={posicaoY(a.inicio, segmentos, px)}
                      altura={posicaoY(a.fim, segmentos, px) - posicaoY(a.inicio, segmentos, px)}
                      profissional={p.nome}
                      ampliada={ampliada}
                      aoAbrir={() => aoAbrir(a.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Linha suave em cada hora e pontilhada a cada 15 min; faixas vazias viram um separador clicável. */
type LinhasProps = { segmentos: Segmento[]; px: number; aoExpandir: (s: Segmento) => void; ampliada: boolean };

function LinhasDeFundo({ segmentos, px, aoExpandir, ampliada }: LinhasProps) {
  return (
    <div className="absolute inset-0">
      {segmentos.map((s, i) =>
        s.compacto ? (
          <button
            key={s.inicio}
            type="button"
            onClick={() => aoExpandir(s)}
            className="group flex w-full items-center gap-3 px-3 text-[11px] text-muted/80 hover:text-accent"
            style={{ height: alturaDoSegmento(s, px) }}
          >
            <span className="h-px flex-1 border-t border-dashed border-black/10 group-hover:border-accent/40" />
            {segmentos.length === 1 ? "Sem atendimentos" : `${formatarHora(s.inicio)} – ${formatarHora(s.fim)} livre`}
            <span className="h-px flex-1 border-t border-dashed border-black/10 group-hover:border-accent/40" />
          </button>
        ) : (
          <div
            key={s.inicio}
            className={i > 0 ? "border-t border-[var(--grid-hour)]" : ""}
            style={{ height: alturaDoSegmento(s, px), backgroundImage: ampliada ? FUNDO_DA_HORA_AMPLIADA : FUNDO_DA_HORA }}
          />
        ),
      )}
    </div>
  );
}

type CardProps = {
  atendimento: Posicionado;
  modo: Modo;
  top: number;
  altura: number;
  profissional: string;
  ampliada: boolean;
  aoAbrir: () => void;
};

function Card({ atendimento: a, modo, top, altura, profissional, ampliada, aoAbrir }: CardProps) {
  const cor = corDoPlano(a);
  const desmarcado = a.status === "desmarcado";
  const descricao = descricaoDoAtendimento(a, profissional);
  const alturaCard = Math.max(altura - 3, 14);
  // Quanto cabe no card, conforme a altura.
  const linhas = alturaCard >= 50 ? 3 : alturaCard >= 34 ? 2 : 1;

  return (
    <button
      type="button"
      onClick={aoAbrir}
      title={descricao}
      aria-label={descricao}
      className={`pointer-events-auto absolute overflow-hidden rounded-xl text-left text-foreground ring-1 ring-black/[0.04] transition hover:z-10 hover:-translate-y-px hover:shadow-md focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        desmarcado ? "opacity-50" : ""
      } ${a.status === "faltou" ? "ring-2 ring-[var(--danger)]" : ""}`}
      style={{
        top: top + 1.5,
        height: alturaCard,
        ...geometriaDoCard(a.faixa, a.faixas, CARD.min, CARD.max),
        background: fundoDoCard(cor),
      }}
    >
      <span className="absolute inset-y-1 left-1 w-1 rounded-full" style={{ background: cor }} aria-hidden />
      <span className={`flex h-full flex-col justify-center gap-px pl-3.5 pr-2 leading-tight ${linhas === 1 ? "flex-row items-center justify-start gap-1.5" : ""}`}>
        <span className={`truncate font-semibold ${ampliada ? "text-[15px]" : modo === "dia" ? "text-sm" : "text-[13px]"} ${desmarcado ? "line-through" : ""}`}>
          {a.paciente ?? "Sem paciente"}
        </span>
        {linhas >= 2 && (
          <span className={`truncate tabular-nums text-muted ${ampliada ? "text-xs" : "text-[11px]"}`}>
            {horarioDoAtendimento(a)}
            {a.status === "atendido" && <span className="text-accent"> · ✓ atendido</span>}
          </span>
        )}
        {linhas >= 3 && (
          <span className={`truncate text-muted ${ampliada ? "text-xs" : "text-[11px]"}`}>{[a.plano?.nome, a.tipo].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </button>
  );
}
