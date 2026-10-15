"use client";

// Menu lateral deslizante com os filtros da agenda.

import { useEffect, useState, type ReactNode } from "react";
import type { ProfissionalAgenda } from "@/lib/agenda/dados";

type MenuProps = {
  aberto: boolean;
  foco: boolean;
  aoMudarFoco: (v: boolean) => void;
  /** Mês e semanas; só no modo foco, quando a barra da agenda está escondida. */
  navegacao: ReactNode;
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
  /** Opções de visualização (só na semana). */
  opcoesDeVisao: ReactNode;
  /** Conteúdo da aba "Filtros avançados" e quantos grupos estão filtrando. */
  filtrosAvancados: ReactNode;
  totalDeFiltros: number;
  aoLimparFiltros: () => void;
};

export function MenuLateral(props: MenuProps) {
  const { aberto, aoFechar } = props;
  const [aba, setAba] = useState<"principal" | "avancados">("principal");

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  // Profissionais e exibição: nas duas abas ("Limpar filtros" não mexe neles).
  const filtrosPadrao = (
    <>
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
          <span className="leading-tight">
            Modo foco
            <span className="block text-xs text-muted">Esconde cabeçalho, mês e semanas</span>
          </span>
          <Interruptor ligado={props.foco} aoMudar={() => props.aoMudarFoco(!props.foco)} rotulo="Modo foco" />
        </label>
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
    </>
  );

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
        {aba === "avancados" ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setAba("principal")} className="-ml-2 rounded-full px-2 py-1 text-sm text-muted hover:bg-background" aria-label="Voltar aos filtros">
                ←
              </button>
              <h2 className="flex-1 text-lg font-semibold">Filtros avançados</h2>
              <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={props.aoLimparFiltros}
              disabled={props.totalDeFiltros === 0}
              className="-mt-3 self-start rounded-full bg-black/[0.04] px-3 py-1.5 text-sm font-medium hover:bg-black/[0.07] disabled:opacity-40"
            >
              Limpar filtros
            </button>
            {props.filtrosAvancados}
            <div className="flex flex-col gap-7 border-t border-border pt-6">
              <p className="-mb-4 text-xs text-muted">Filtros padrão (não mudam com “Limpar filtros”)</p>
              {filtrosPadrao}
            </div>
          </>
        ) : (
        <>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filtros</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={() => setAba("avancados")}
          className="-mt-2 flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5 text-sm font-medium hover:bg-black/[0.06]"
        >
          <span className="flex items-center gap-2">
            Filtros avançados
            {props.totalDeFiltros > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-white">{props.totalDeFiltros}</span>
            )}
          </span>
          <span aria-hidden className="text-muted">
            →
          </span>
        </button>

        {props.navegacao && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Período</h3>
            {props.navegacao}
          </section>
        )}

        {props.opcoesDeVisao && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Visualização</h3>
            <nav aria-label="Tipo de visualização" className="flex flex-col gap-1">
              {props.opcoesDeVisao}
            </nav>
          </section>
        )}

        {filtrosPadrao}

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
        </>
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
