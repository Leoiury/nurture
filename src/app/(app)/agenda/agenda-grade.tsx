"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AtendimentoAgenda, ProfissionalAgenda } from "@/lib/agenda/dados";
import type { Segmento } from "@/lib/agenda/layout";
import { sufixoDaVisao, type Visao } from "@/lib/agenda/visao";
import { agruparPorColuna, useAlturaDoElemento, useModoFoco } from "./comum";
import { MenuLateral } from "./menu-lateral";
import { PainelAtendimento } from "./painel-atendimento";
import { PainelNovoAtendimento } from "./painel-novo-atendimento";
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
  /** Navegação (mês/semana), exibida na barra acima da agenda. */
  navegacao: ReactNode;
  /** A mesma navegação em coluna, para o menu lateral no modo foco (quando a barra some). */
  navegacaoNoMenu: ReactNode;
};

export function AgendaGrade({ modo, visao, urlDaVisao, dias, hoje, profissionais, atendimentos, navegacao, navegacaoNoMenu }: Props) {
  // Profissionais sem atendimentos no período começam ocultos (podem ser exibidos no menu).
  const [ocultos, setOcultos] = useState<Set<string>>(
    () => new Set(profissionais.filter((p) => !atendimentos.some((a) => a.profissionalId === p.id)).map((p) => p.id)),
  );
  const [compactar, setCompactar] = useState(true);
  const [mostrarDesmarcados, setMostrarDesmarcados] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
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

  // A visão lado a lado só faz sentido para a semana; um dia usa a empilhada.
  const visaoEfetiva: Visao = modo === "dia" && visao === "lado" ? "empilhada" : visao;
  const ladoALado = visaoEfetiva === "lado";
  const sufixoUrl = sufixoDaVisao(visao);
  // Ao abrir a semana atual, rola até o dia de hoje (nas visões empilhadas).
  useEffect(() => {
    if (ladoALado || modo !== "semana") return;
    const secao = quadro.current?.querySelector<HTMLElement>(`section[aria-label="${hoje}"]`);
    if (secao && quadro.current) quadro.current.scrollTop = secao.offsetTop - secao.clientTop - parseFloat(getComputedStyle(secao).scrollMarginTop || "0");
    // Só na abertura: a grade é recriada a cada semana (key na página).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const propsVisao = { dias, hoje, colunas, visiveis, porColuna, compactar, expandidos, aoExpandir: expandirSegmento, aoAbrir: setSelecionado, sufixoUrl, alturaVisivel };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Barra: some no modo foco (via CSS, para valer já na primeira pintura). */}
      <div data-barra-agenda className="flex shrink-0 flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          aria-expanded={menuAberto}
          aria-controls="menu-agenda"
          aria-label="Filtros"
          title="Filtros"
          className="relative inline-flex size-9 items-center justify-center rounded-full bg-surface shadow-sm ring-1 ring-black/5 transition hover:shadow"
        >
          <IconeFiltros />
          <ContadorOcultos quantidade={ocultos.size} />
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
          // Encaixe por dia só quando cada dia cabe na tela (na ampliada ele atrapalharia a rolagem).
          visaoEfetiva === "empilhada" ? "snap-y snap-proximity" : ""
        }`}
      >
        {ladoALado ? (
          <VisaoLadoALado {...propsVisao} />
        ) : (
          <VisaoEmpilhada modo={modo} ampliada={visaoEfetiva === "ampliada"} {...propsVisao} />
        )}
      </div>

      {/* Modo foco: botão no topo para sair dele (visível só no foco, via CSS). */}
      <button
        data-botao-flutuante
        type="button"
        onClick={() => setFoco(false)}
        title="Sair do modo foco"
        aria-label="Sair do modo foco"
        className="fixed top-3 right-3 z-30 inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-muted shadow-md ring-1 ring-black/5 backdrop-blur transition hover:text-foreground hover:shadow-lg"
      >
        <IconeRecolher />
      </button>

      {/* Modo foco: filtros num botão flutuante no canto superior esquerdo (abre o menu, com o período). */}
      <button
        data-botao-flutuante
        type="button"
        onClick={() => setMenuAberto(true)}
        aria-expanded={menuAberto}
        aria-controls="menu-agenda"
        aria-label="Filtros"
        title="Filtros e período"
        className="fixed top-3 left-3 z-30 inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-md ring-1 ring-black/5 backdrop-blur transition hover:shadow-lg"
      >
        <IconeFiltros />
        <ContadorOcultos quantidade={ocultos.size} />
      </button>

      {/* Novo atendimento: sempre visível, no canto inferior direito. */}
      <button
        type="button"
        onClick={() => setCriando(true)}
        aria-label="Novo atendimento"
        title="Novo atendimento"
        className="fixed right-5 bottom-5 z-30 inline-flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/20 transition hover:brightness-110 active:scale-95"
      >
        <IconeMais />
      </button>

      <MenuLateral
        aberto={menuAberto}
        foco={foco}
        aoMudarFoco={(v) => {
          setFoco(v);
          // Ao sair do foco a barra volta; o menu pode fechar.
          if (!v) setMenuAberto(false);
        }}
        navegacao={foco ? navegacaoNoMenu : null}
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
          <>
            <OpcaoVisao
              aoEscolher={() => setMenuAberto(false)}
              href={urlDaVisao.empilhada}
              ativa={visaoEfetiva === "empilhada"}
              rotulo="Empilhado"
              descricao={modo === "semana" ? "Um dia abaixo do outro" : "Das 08h às 18h na tela"}
              icone={<IconeEmpilhado />}
            />
            <OpcaoVisao
              aoEscolher={() => setMenuAberto(false)}
              href={urlDaVisao.ampliada}
              ativa={visaoEfetiva === "ampliada"}
              rotulo="Ampliado"
              descricao="Linhas altas, horários livres mais claros"
              icone={<IconeAmpliado />}
            />
            {modo === "semana" && (
              <OpcaoVisao
                aoEscolher={() => setMenuAberto(false)}
                href={urlDaVisao.lado}
                ativa={ladoALado}
                rotulo="Lado a lado"
                descricao="A semana inteira numa tela"
                icone={<IconeLadoALado />}
              />
            )}
          </>
        }
      />

      {selecionado && <PainelAtendimento key={selecionado} id={selecionado} aoFechar={() => setSelecionado(null)} />}
      {criando && <PainelNovoAtendimento aoFechar={() => setCriando(false)} />}
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

/** Número de profissionais ocultos, como um selo no canto do botão de filtros. */
function ContadorOcultos({ quantidade }: { quantidade: number }) {
  if (quantidade === 0) return null;
  return (
    <span
      className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-white"
      title={`${quantidade} profissiona${quantidade === 1 ? "l oculto" : "is ocultos"}`}
    >
      {quantidade}
    </span>
  );
}

function IconeFiltros() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconeMais() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 4v14M4 11h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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

function IconeAmpliado() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 8h12" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 4.5h4M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
