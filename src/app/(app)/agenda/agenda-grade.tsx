"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import {
  alturaDoSegmento,
  distribuirEmFaixas,
  montarSegmentos,
  posicaoY,
  type Faixa,
  type Segmento,
} from "@/lib/agenda/layout";
import { corDoTexto } from "@/lib/agenda/cores";
import { diaDoMes, formatarHora, nomeCurtoDoDia } from "@/lib/agenda/tempo";
import { PainelAtendimento } from "./painel-atendimento";

type Modo = "semana" | "dia";

type Props = {
  modo: Modo;
  dias: string[];
  hoje: string;
  profissionais: ProfissionalAgenda[];
  atendimentos: AtendimentoAgenda[];
};

// Escala vertical (px por 15 min) e largura mínima de cada coluna de profissional.
const PX_POR_QUARTO: Record<Modo, number> = { semana: 12, dia: 18 };
const LARGURA_COLUNA: Record<Modo, number> = { semana: 30, dia: 160 };
const ALTURA_CABECALHO = 58;
const LARGURA_EIXO = 52;
// Faixa sempre visível, mesmo sem atendimentos.
const HORARIO_PADRAO = { inicio: 8 * 60, fim: 18 * 60 };

const COR_SEM_PLANO = "#e5e7eb";

function iniciais(nome: string): string {
  const partes = nome.split(" ").filter((p) => p.length > 2 || p === nome);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

function primeiroNome(nome: string | null): string {
  return nome?.split(" ")[0] ?? "—";
}

type Posicionado = AtendimentoAgenda & Faixa;

export function AgendaGrade({ modo, dias, hoje, profissionais, atendimentos }: Props) {
  // Profissionais sem atendimentos no período começam ocultos (podem ser exibidos pelo filtro).
  const [ocultos, setOcultos] = useState<Set<string>>(
    () => new Set(profissionais.filter((p) => !atendimentos.some((a) => a.profissionalId === p.id)).map((p) => p.id)),
  );
  const [compactar, setCompactar] = useState(true);
  const [mostrarDesmarcados, setMostrarDesmarcados] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const colunas = profissionais.filter((p) => !ocultos.has(p.id));
  const visiveis = useMemo(
    () =>
      atendimentos.filter(
        (a) => !ocultos.has(a.profissionalId) && (mostrarDesmarcados || a.status !== "desmarcado"),
      ),
    [atendimentos, ocultos, mostrarDesmarcados],
  );

  const segmentos = useMemo(
    () =>
      montarSegmentos(visiveis, {
        inicioPadrao: HORARIO_PADRAO.inicio,
        fimPadrao: HORARIO_PADRAO.fim,
        compactar,
        expandidos,
      }),
    [visiveis, compactar, expandidos],
  );

  // Atendimentos agrupados por dia + profissional, já distribuídos em faixas.
  const porColuna = useMemo(() => {
    const grupos = new Map<string, AtendimentoAgenda[]>();
    for (const a of visiveis) {
      const chave = `${a.data}|${a.profissionalId}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
    }
    const resultado = new Map<string, Posicionado[]>();
    for (const [chave, itens] of grupos) {
      const faixas = distribuirEmFaixas(itens);
      resultado.set(chave, itens.map((a, i) => ({ ...a, ...faixas[i] })));
    }
    return resultado;
  }, [visiveis]);

  const px = PX_POR_QUARTO[modo];
  const alturaTotal = segmentos.reduce((soma, s) => soma + alturaDoSegmento(s, px), 0);
  const larguraMinima = LARGURA_EIXO + dias.length * Math.max(colunas.length, 1) * LARGURA_COLUNA[modo];

  const planos = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of atendimentos) if (a.plano) m.set(a.plano.nome, a.plano.cor);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [atendimentos]);

  function alternarProfissional(id: string) {
    setOcultos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function expandirSegmento(s: Segmento) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      for (let h = s.inicio; h < s.fim; h += 60) novo.add(h);
      return novo;
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Profissionais visíveis">
          {profissionais.map((p) => {
            const ativo = !ocultos.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternarProfissional(p.id)}
                title={p.especialidade ? `${p.nome} · ${p.especialidade}` : p.nome}
                className={`rounded-full border px-2.5 py-0.5 transition ${
                  ativo
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border bg-surface text-muted line-through decoration-muted/50"
                }`}
              >
                <span className="font-semibold">{iniciais(p.nome)}</span>{" "}
                <span className="hidden sm:inline">{primeiroNome(p.nome)}</span>
              </button>
            );
          })}
          {ocultos.size > 0 && (
            <button type="button" onClick={() => setOcultos(new Set())} className="px-2 text-accent hover:underline">
              Mostrar todos ({ocultos.size} oculto{ocultos.size === 1 ? "" : "s"})
            </button>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={compactar}
              onChange={(e) => {
                setCompactar(e.target.checked);
                setExpandidos(new Set());
              }}
              className="accent-[var(--accent)]"
            />
            Compactar horários vazios
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={mostrarDesmarcados}
              onChange={(e) => setMostrarDesmarcados(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Mostrar desmarcados
          </label>
        </div>
      </div>

      {/* Legenda de planos */}
      {planos.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legenda de planos">
          {planos.map(([nome, cor]) => (
            <li key={nome} className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm border border-black/10" style={{ background: cor }} />
              {nome}
            </li>
          ))}
        </ul>
      )}

      {/* Grade */}
      <div className="relative max-h-[calc(100vh-190px)] min-h-[420px] flex-1 overflow-auto rounded-xl border border-border bg-surface">
        <div className="flex" style={{ minWidth: larguraMinima }}>
          {/* Eixo de horários */}
          <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-surface" style={{ width: LARGURA_EIXO }}>
            <div className="sticky top-0 z-10 border-b border-border bg-surface" style={{ height: ALTURA_CABECALHO }} />
            {segmentos.map((s, i) =>
              s.compacto ? (
                <button
                  key={s.inicio}
                  type="button"
                  onClick={() => expandirSegmento(s)}
                  title={`Sem atendimentos das ${formatarHora(s.inicio)} às ${formatarHora(s.fim)}. Clique para expandir.`}
                  className="block w-full text-center text-[10px] leading-none text-muted hover:bg-accent-soft hover:text-accent"
                  style={{ height: alturaDoSegmento(s, px) }}
                >
                  {s.inicio / 60}h–{s.fim / 60}h
                </button>
              ) : (
                <div key={s.inicio} className="relative" style={{ height: alturaDoSegmento(s, px) }}>
                  {/* Rótulo centrado na linha da hora; abaixo dela quando não há espaço acima. */}
                  <span
                    className={`absolute right-1.5 bg-surface px-0.5 text-[11px] tabular-nums text-muted ${
                      i === 0 || segmentos[i - 1].compacto ? "top-0.5" : "-top-2"
                    }`}
                  >
                    {formatarHora(s.inicio)}
                  </span>
                </div>
              ),
            )}
          </div>

          {/* Dias */}
          {dias.map((dia) => {
            const total = visiveis.filter((a) => a.data === dia && a.status !== "desmarcado").length;
            const ehHoje = dia === hoje;
            return (
              <section key={dia} className="flex min-w-0 flex-1 flex-col border-l-2 border-border first-of-type:border-l-0" aria-label={dia}>
                {/* Cabeçalho do dia */}
                <div className="sticky top-0 z-10 flex flex-col border-b border-border bg-surface" style={{ height: ALTURA_CABECALHO }}>
                  {modo === "semana" ? (
                    <Link
                      href={`/agenda?dia=${dia}`}
                      title="Abrir o dia"
                      className={`flex flex-1 items-center justify-center gap-1.5 text-sm hover:bg-accent-soft ${ehHoje ? "text-accent" : ""}`}
                    >
                      <span className="capitalize text-muted">{nomeCurtoDoDia(dia)}</span>
                      <span className={`font-semibold tabular-nums ${ehHoje ? "rounded-full bg-accent px-1.5 text-white" : ""}`}>
                        {diaDoMes(dia)}
                      </span>
                      <span className="text-xs text-muted">· {total}</span>
                    </Link>
                  ) : (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted">
                      {total} atendimento{total === 1 ? "" : "s"}
                    </div>
                  )}
                  <div className="flex h-6 border-t border-border">
                    {colunas.map((p) => (
                      <div
                        key={p.id}
                        title={p.nome}
                        className="flex min-w-0 flex-1 items-center justify-center truncate border-l border-border px-0.5 text-[10px] font-semibold text-muted first:border-l-0"
                      >
                        {modo === "semana" ? iniciais(p.nome) : p.nome}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Corpo do dia */}
                <div className="relative" style={{ height: alturaTotal }}>
                  <LinhasDeFundo segmentos={segmentos} px={px} />
                  <div className="absolute inset-0 flex">
                    {colunas.map((p) => (
                      <div key={p.id} className="relative min-w-0 flex-1 border-l border-[var(--grid-quarter)] first:border-l-0">
                        {(porColuna.get(`${dia}|${p.id}`) ?? []).map((a) => (
                          <Card
                            key={a.id}
                            atendimento={a}
                            modo={modo}
                            top={posicaoY(a.inicio, segmentos, px)}
                            altura={posicaoY(a.fim, segmentos, px) - posicaoY(a.inicio, segmentos, px)}
                            profissional={p.nome}
                            aoAbrir={() => setSelecionado(a.id)}
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
      </div>

      {selecionado && (
        <PainelAtendimento key={selecionado} id={selecionado} aoFechar={() => setSelecionado(null)} />
      )}
    </div>
  );
}

/** Linhas horizontais: fortes nas horas, finas a cada 15 min; faixas compactas hachuradas. */
function LinhasDeFundo({ segmentos, px }: { segmentos: Segmento[]; px: number }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {segmentos.map((s) => (
        <div
          key={s.inicio}
          className="border-t border-[var(--grid-hour)]"
          style={{
            height: alturaDoSegmento(s, px),
            backgroundImage: s.compacto
              ? "repeating-linear-gradient(135deg, var(--grid-quarter) 0 4px, transparent 4px 8px)"
              : `repeating-linear-gradient(to bottom, transparent 0 ${px - 1}px, var(--grid-quarter) ${px - 1}px ${px}px)`,
          }}
        />
      ))}
    </div>
  );
}

type CardProps = {
  atendimento: Posicionado;
  modo: Modo;
  top: number;
  altura: number;
  profissional: string;
  aoAbrir: () => void;
};

function Card({ atendimento: a, modo, top, altura, profissional, aoAbrir }: CardProps) {
  const cor = a.plano?.cor ?? COR_SEM_PLANO;
  const horario = `${formatarHora(a.inicio)}–${formatarHora(a.fim)}`;
  const desmarcado = a.status === "desmarcado";
  const descricao = [horario, a.paciente ?? "Sem paciente", profissional, a.plano?.nome, a.tipo, a.status]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={aoAbrir}
      title={descricao}
      aria-label={descricao}
      className={`absolute overflow-hidden rounded-[5px] text-left shadow-[0_1px_1px_rgba(0,0,0,0.06)] transition hover:z-10 hover:brightness-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        desmarcado ? "opacity-45" : ""
      } ${a.status === "faltou" ? "ring-2 ring-[var(--danger)] ring-inset" : ""}`}
      style={{
        top: top + 1,
        height: Math.max(altura - 2, 10),
        left: `calc(${(a.faixa / a.faixas) * 100}% + 1px)`,
        width: `calc(${100 / a.faixas}% - 2px)`,
        background: cor,
        color: corDoTexto(cor),
        borderLeft: `3px solid color-mix(in srgb, ${cor} 55%, #000)`,
      }}
    >
      {modo === "semana" ? (
        <span className={`block truncate px-0.5 pt-px text-[10px] leading-tight font-medium ${desmarcado ? "line-through" : ""}`}>
          {primeiroNome(a.paciente)}
        </span>
      ) : (
        <span className="flex flex-col gap-px px-1.5 py-0.5 text-xs leading-snug">
          <span className="tabular-nums text-[11px] opacity-75">
            {horario}
            {a.status === "atendido" && " ✓"}
          </span>
          <span className={`truncate font-semibold ${desmarcado ? "line-through" : ""}`}>{a.paciente ?? "Sem paciente"}</span>
          <span className="truncate text-[11px] opacity-75">{[a.plano?.nome, a.tipo].filter(Boolean).join(" · ")}</span>
        </span>
      )}
    </button>
  );
}
