"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import type { Segmento } from "@/lib/agenda/layout";
import { agruparPorColuna, useAlturaDoElemento, useModoFoco, type Visao } from "./comum";
import { MenuLateral } from "./menu-lateral";
import { PainelAtendimento } from "./painel-atendimento";
import { VisaoEmpilhada } from "./visao-empilhada";
import { VisaoLadoALado } from "./visao-lado-a-lado";

type Props = {
  modo: "semana" | "dia";
  visao: Visao;
  /** Endereço da página atual em cada visão (para o seletor). */
  urlDaVisao: Record<Visao, string>;
  dias: string[];
  hoje: string;
  profissionais: ProfissionalAgenda[];
  atendimentos: AtendimentoAgenda[];
  /** Navegação (mês/semana), exibida ao lado do botão de filtros. */
  navegacao: ReactNode;
};

export function AgendaGrade({ modo, visao, urlDaVisao, dias, hoje, profissionais, atendimentos, navegacao }: Props) {
  // Profissionais sem atendimentos no período começam ocultos (podem ser exibidos no menu).
  const [ocultos, setOcultos] = useState<Set<string>>(
    () => new Set(profissionais.filter((p) => !atendimentos.some((a) => a.profissionalId === p.id)).map((p) => p.id)),
  );
  const [compactar, setCompactar] = useState(true);
  const [mostrarDesmarcados, setMostrarDesmarcados] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [foco, setFoco] = useModoFoco();
  const quadro = useRef<HTMLDivElement>(null);
  const alturaVisivel = useAlturaDoElemento(quadro);

  const colunas = profissionais.filter((p) => !ocultos.has(p.id));
  const visiveis = useMemo(
    () => atendimentos.filter((a) => !ocultos.has(a.profissionalId) && (mostrarDesmarcados || a.status !== "desmarcado")),
    [atendimentos, ocultos, mostrarDesmarcados],
  );
  const porColuna = useMemo(() => agruparPorColuna(visiveis), [visiveis]);

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

  function expandirSegmento(escopo: string, s: Segmento) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      for (let h = s.inicio; h < s.fim; h += 60) novo.add(`${escopo}|${h}`);
      return novo;
    });
  }

  // A visão lado a lado só faz sentido para a semana; um dia é sempre empilhado.
  const ladoALado = modo === "semana" && visao === "lado";
  const sufixoUrl = visao === "lado" ? "&visao=lado" : "";
  const propsVisao = { dias, hoje, colunas, visiveis, porColuna, compactar, expandidos, aoExpandir: expandirSegmento, aoAbrir: setSelecionado, sufixoUrl, alturaVisivel };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
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
            <span className="rounded-full bg-accent-soft px-1.5 text-xs text-accent">
              {ocultos.size} oculto{ocultos.size === 1 ? "" : "s"}
            </span>
          )}
        </button>

        {/* Largura mínima: sem espaço, a navegação desce para a linha de baixo em vez de transbordar. */}
        <div className="min-w-[18rem] flex-1">{navegacao}</div>

        <button
          type="button"
          onClick={() => setFoco(!foco)}
          aria-pressed={foco}
          title={foco ? "Mostrar o cabeçalho" : "Esconder o cabeçalho e ampliar a agenda"}
          aria-label={foco ? "Mostrar o cabeçalho" : "Ampliar a agenda"}
          className="inline-flex size-9 items-center justify-center rounded-full bg-surface shadow-sm ring-1 ring-black/5 transition hover:shadow"
        >
          {foco ? <IconeRecolher /> : <IconeAmpliar />}
        </button>
      </div>

      {/* Ocupa toda a altura restante; as visões ajustam a escala a ela. */}
      <div
        ref={quadro}
        className={`relative min-h-[320px] flex-1 overflow-auto rounded-3xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] ${
          ladoALado ? "" : "snap-y snap-proximity"
        }`}
      >
        {ladoALado ? <VisaoLadoALado {...propsVisao} /> : <VisaoEmpilhada modo={modo} {...propsVisao} />}
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
        opcoesDeVisao={
          modo === "semana" && (
            <>
              <OpcaoVisao aoEscolher={() => setMenuAberto(false)} href={urlDaVisao.empilhada} ativa={!ladoALado} rotulo="Empilhado" descricao="Um dia abaixo do outro" icone={<IconeEmpilhado />} />
              <OpcaoVisao aoEscolher={() => setMenuAberto(false)} href={urlDaVisao.lado} ativa={ladoALado} rotulo="Lado a lado" descricao="A semana inteira numa tela" icone={<IconeLadoALado />} />
            </>
          )
        }
      />

      {selecionado && <PainelAtendimento key={selecionado} id={selecionado} aoFechar={() => setSelecionado(null)} />}
    </div>
  );
}

type OpcaoVisaoProps = { href: string; ativa: boolean; rotulo: string; descricao: string; icone: ReactNode; aoEscolher: () => void };

function OpcaoVisao({ href, ativa, rotulo, descricao, icone, aoEscolher }: OpcaoVisaoProps) {
  return (
    <Link
      href={href}
      // A semana continua a mesma, então o componente (e o menu aberto) seria mantido.
      onClick={aoEscolher}
      aria-current={ativa ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-2 py-2 transition ${ativa ? "bg-accent-soft text-accent" : "hover:bg-background"}`}
    >
      <span className={`flex size-8 items-center justify-center rounded-lg ${ativa ? "bg-surface" : "bg-black/[0.04] text-muted"}`}>{icone}</span>
      <span className="leading-tight">
        <span className="block text-sm font-medium">{rotulo}</span>
        <span className={`block text-xs ${ativa ? "text-accent/80" : "text-muted"}`}>{descricao}</span>
      </span>
    </Link>
  );
}

function IconeFiltros() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconeEmpilhado() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2.5" width="12" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="12" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconeLadoALado() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="3.6" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="6.2" y="2.5" width="3.6" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10.9" y="2.5" width="3.6" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconeAmpliar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconeRecolher() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M13 7H9V3M3 9h4v4M9 7l4.5-4.5M7 9l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
