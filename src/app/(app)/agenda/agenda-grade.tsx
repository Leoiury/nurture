"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import {
  alturaDoSegmento,
  distribuirEmFaixas,
  montarSegmentos,
  posicaoY,
  type Faixa,
  type Segmento,
} from "@/lib/agenda/layout";
import { formatarHora, nomeLongoDoDia } from "@/lib/agenda/tempo";
import { PainelAtendimento } from "./painel-atendimento";

type Modo = "semana" | "dia";

type Props = {
  modo: Modo;
  dias: string[];
  hoje: string;
  profissionais: ProfissionalAgenda[];
  atendimentos: AtendimentoAgenda[];
  /** Navegação (mês/semana), exibida ao lado do botão de filtros. */
  navegacao: ReactNode;
};

// Layout: colunas = profissionais; eixo vertical = dias empilhados, cada um com suas horas.
const PX_POR_QUARTO: Record<Modo, number> = { semana: 14, dia: 20 };
const LARGURA_MIN_COLUNA = 168;
const LARGURA_EIXO = 56;
const ALTURA_CABECALHO_PROF = 64;
const ALTURA_CABECALHO_DIA = 44;
// Faixa sempre considerada no dia, mesmo sem atendimentos.
const HORARIO_PADRAO = { inicio: 8 * 60, fim: 18 * 60 };

const COR_SEM_PLANO = "#9ca3af";

function iniciais(nome: string): string {
  const partes = nome.split(" ").filter((p) => p.length > 2);
  return ((partes[0]?.[0] ?? nome[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
}

type Posicionado = AtendimentoAgenda & Faixa;

export function AgendaGrade({ modo, dias, hoje, profissionais, atendimentos, navegacao }: Props) {
  // Profissionais sem atendimentos no período começam ocultos (podem ser exibidos no menu).
  const [ocultos, setOcultos] = useState<Set<string>>(
    () => new Set(profissionais.filter((p) => !atendimentos.some((a) => a.profissionalId === p.id)).map((p) => p.id)),
  );
  const [compactar, setCompactar] = useState(true);
  const [mostrarDesmarcados, setMostrarDesmarcados] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set()); // "dia|minutoDaHora"
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const colunas = profissionais.filter((p) => !ocultos.has(p.id));
  const visiveis = useMemo(
    () =>
      atendimentos.filter(
        (a) => !ocultos.has(a.profissionalId) && (mostrarDesmarcados || a.status !== "desmarcado"),
      ),
    [atendimentos, ocultos, mostrarDesmarcados],
  );

  // Cada dia tem seus próprios segmentos: as horas vazias de um dia não dependem dos outros.
  const px = PX_POR_QUARTO[modo];
  const segmentosPorDia = useMemo(() => {
    const m = new Map<string, Segmento[]>();
    for (const dia of dias) {
      const doDia = visiveis.filter((a) => a.data === dia);
      const expandidosDoDia = new Set(
        [...expandidos].filter((k) => k.startsWith(`${dia}|`)).map((k) => Number(k.split("|")[1])),
      );
      m.set(
        dia,
        montarSegmentos(doDia, {
          inicioPadrao: HORARIO_PADRAO.inicio,
          fimPadrao: HORARIO_PADRAO.fim,
          compactar,
          expandidos: expandidosDoDia,
        }),
      );
    }
    return m;
  }, [dias, visiveis, compactar, expandidos]);

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

  const planos = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of atendimentos) if (a.plano) m.set(a.plano.nome, a.plano.cor);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [atendimentos]);

  const larguraMinima = LARGURA_EIXO + Math.max(colunas.length, 1) * LARGURA_MIN_COLUNA;

  function alternarProfissional(id: string) {
    setOcultos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function expandirSegmento(dia: string, s: Segmento) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      for (let h = s.inicio; h < s.fim; h += 60) novo.add(`${dia}|${h}`);
      return novo;
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-expanded={menuAberto}
          aria-controls="menu-agenda"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-sm font-medium shadow-sm ring-1 ring-black/5 transition hover:shadow"
        >
          <IconeFiltros />
          Filtros
          {ocultos.size > 0 && (
            <span className="rounded-full bg-accent-soft px-1.5 text-xs text-accent">{ocultos.size} oculto{ocultos.size === 1 ? "" : "s"}</span>
          )}
        </button>
        <div className="min-w-0 flex-1">{navegacao}</div>
      </div>

      {/* Agenda */}
      <div className="relative max-h-[calc(100vh-150px)] min-h-[440px] flex-1 overflow-auto rounded-3xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]">
        <div style={{ minWidth: larguraMinima }}>
          {/* Profissionais */}
          <div
            className="sticky top-0 z-30 flex border-b border-black/[0.06] bg-surface/95 backdrop-blur"
            style={{ height: ALTURA_CABECALHO_PROF }}
          >
            <div className="sticky left-0 z-10 shrink-0 bg-surface/95" style={{ width: LARGURA_EIXO }} />
            {colunas.map((p) => (
              <div key={p.id} className="flex min-w-0 flex-1 items-center gap-2.5 px-3" title={p.nome}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                  {iniciais(p.nome)}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium">{p.nome}</span>
                  {p.especialidade && <span className="block truncate text-xs text-muted">{p.especialidade}</span>}
                </span>
              </div>
            ))}
            {colunas.length === 0 && (
              <div className="flex flex-1 items-center px-4 text-sm text-muted">Nenhum profissional selecionado.</div>
            )}
          </div>

          {/* Dias, um abaixo do outro */}
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
              aoExpandir={(s) => expandirSegmento(dia, s)}
              aoAbrir={setSelecionado}
            />
          ))}
        </div>
      </div>

      <MenuLateral
        aberto={menuAberto}
        aoFechar={() => setMenuAberto(false)}
        profissionais={profissionais}
        ocultos={ocultos}
        aoAlternar={alternarProfissional}
        aoMostrarTodos={() => setOcultos(new Set())}
        planos={planos}
        compactar={compactar}
        aoCompactar={(v) => {
          setCompactar(v);
          setExpandidos(new Set());
        }}
        mostrarDesmarcados={mostrarDesmarcados}
        aoMostrarDesmarcados={setMostrarDesmarcados}
      />

      {selecionado && (
        <PainelAtendimento key={selecionado} id={selecionado} aoFechar={() => setSelecionado(null)} />
      )}
    </div>
  );
}

// Um dia --------------------------------------------------------------------------

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
};

function Dia({ dia, ehHoje, modo, px, segmentos, colunas, porColuna, total, aoExpandir, aoAbrir }: DiaProps) {
  const altura = segmentos.reduce((soma, s) => soma + alturaDoSegmento(s, px), 0);
  const titulo = nomeLongoDoDia(dia);

  return (
    <section aria-label={dia} className="border-b border-black/[0.06] last:border-b-0">
      <div
        className="sticky z-20 flex items-center border-b border-black/[0.04] bg-surface/95 backdrop-blur"
        style={{ top: ALTURA_CABECALHO_PROF, height: ALTURA_CABECALHO_DIA }}
      >
        <div className="sticky left-0 flex items-center gap-2.5 px-4">
          <span className={`size-2 rounded-full ${ehHoje ? "bg-accent" : "bg-black/15"}`} aria-hidden />
          {modo === "semana" ? (
            <Link href={`/agenda?dia=${dia}`} className="text-sm font-semibold first-letter:uppercase hover:text-accent" title="Abrir só este dia">
              {titulo}
            </Link>
          ) : (
            <span className="text-sm font-semibold first-letter:uppercase">{titulo}</span>
          )}
          {ehHoje && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">Hoje</span>}
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
                <span
                  className={`absolute right-2 text-[11px] tabular-nums text-muted ${
                    i === 0 || segmentos[i - 1].compacto ? "top-1" : "-top-2"
                  }`}
                >
                  {formatarHora(s.inicio)}
                </span>
              </div>
            ),
          )}
        </div>

        {/* Colunas dos profissionais */}
        <div className="relative flex-1">
          <LinhasDeFundo segmentos={segmentos} px={px} aoExpandir={aoExpandir} />
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
function LinhasDeFundo({ segmentos, px, aoExpandir }: { segmentos: Segmento[]; px: number; aoExpandir: (s: Segmento) => void }) {
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
            className={i > 0 && !segmentos[i - 1].compacto ? "border-t border-black/[0.06]" : ""}
            style={{
              height: alturaDoSegmento(s, px),
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${px - 1}px, rgba(0,0,0,0.025) ${px - 1}px ${px}px)`,
            }}
          />
        ),
      )}
    </div>
  );
}

// Card ------------------------------------------------------------------------------

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
  const horario = `${formatarHora(a.inicio)} – ${formatarHora(a.fim)}`;
  const desmarcado = a.status === "desmarcado";
  const descricao = [horario, a.paciente ?? "Sem paciente", profissional, a.plano?.nome, a.tipo, a.status]
    .filter(Boolean)
    .join(" · ");
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
        left: `calc(${(a.faixa / a.faixas) * 100}% + ${a.faixa > 0 ? 2 : 0}px)`,
        width: `calc(${100 / a.faixas}% - ${a.faixas > 1 ? 2 : 0}px)`,
        background: `color-mix(in srgb, ${cor} 26%, white)`,
      }}
    >
      <span className="absolute inset-y-1 left-1 w-1 rounded-full" style={{ background: cor }} aria-hidden />
      <span className={`flex h-full flex-col justify-center gap-px pl-3.5 pr-2 leading-tight ${linhas === 1 ? "flex-row items-center justify-start gap-1.5" : ""}`}>
        <span className={`truncate font-semibold ${modo === "dia" ? "text-sm" : "text-[13px]"} ${desmarcado ? "line-through" : ""}`}>
          {a.paciente ?? "Sem paciente"}
        </span>
        {linhas >= 2 && (
          <span className="truncate text-[11px] tabular-nums text-muted">
            {horario}
            {a.status === "atendido" && <span className="text-accent"> · ✓ atendido</span>}
          </span>
        )}
        {linhas >= 3 && <span className="truncate text-[11px] text-muted">{[a.plano?.nome, a.tipo].filter(Boolean).join(" · ")}</span>}
      </span>
    </button>
  );
}

// Menu lateral ------------------------------------------------------------------------

type MenuProps = {
  aberto: boolean;
  aoFechar: () => void;
  profissionais: ProfissionalAgenda[];
  ocultos: Set<string>;
  aoAlternar: (id: string) => void;
  aoMostrarTodos: () => void;
  planos: [string, string][];
  compactar: boolean;
  aoCompactar: (v: boolean) => void;
  mostrarDesmarcados: boolean;
  aoMostrarDesmarcados: (v: boolean) => void;
};

function MenuLateral(props: MenuProps) {
  const { aberto, aoFechar } = props;

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 ${aberto ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={aoFechar}
        aria-hidden
      />
      <aside
        id="menu-agenda"
        role="dialog"
        aria-modal="true"
        aria-label="Filtros da agenda"
        inert={!aberto}
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-xs flex-col gap-7 overflow-y-auto bg-surface p-6 shadow-2xl transition-transform duration-300 ease-out ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Profissionais</h3>
            {props.ocultos.size > 0 && (
              <button type="button" onClick={props.aoMostrarTodos} className="text-xs text-accent hover:underline">
                Mostrar todos
              </button>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {props.profissionais.map((p) => {
              const visivel = !props.ocultos.has(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-background">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                        visivel ? "bg-accent-soft text-accent" : "bg-black/5 text-muted"
                      }`}
                    >
                      {iniciais(p.nome)}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className={`block truncate text-sm ${visivel ? "font-medium" : "text-muted"}`}>{p.nome}</span>
                      {p.especialidade && <span className="block truncate text-xs text-muted">{p.especialidade}</span>}
                    </span>
                    <Interruptor ligado={visivel} aoMudar={() => props.aoAlternar(p.id)} rotulo={`Mostrar ${p.nome}`} />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Exibição</h3>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-background">
            Compactar horários vazios
            <Interruptor ligado={props.compactar} aoMudar={() => props.aoCompactar(!props.compactar)} rotulo="Compactar horários vazios" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-background">
            Mostrar desmarcados
            <Interruptor
              ligado={props.mostrarDesmarcados}
              aoMudar={() => props.aoMostrarDesmarcados(!props.mostrarDesmarcados)}
              rotulo="Mostrar desmarcados"
            />
          </label>
        </section>

        {props.planos.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Planos</h3>
            <ul className="flex flex-col gap-1.5 px-2">
              {props.planos.map(([nome, cor]) => (
                <li key={nome} className="flex items-center gap-2.5 text-sm">
                  <span className="size-3 rounded-full" style={{ background: cor }} />
                  {nome}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </>
  );
}

function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: () => void; rotulo: string }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" checked={ligado} onChange={aoMudar} aria-label={rotulo} className="peer sr-only" />
      <span
        aria-hidden
        className={`h-5 w-9 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 ${ligado ? "bg-accent" : "bg-black/15"}`}
      />
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${ligado ? "translate-x-4" : ""}`}
      />
    </span>
  );
}

function IconeFiltros() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
