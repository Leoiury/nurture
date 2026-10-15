"use client";

// Aba "Filtros avançados" do menu lateral: paciente(s), plano, guia, status, tipo,
// série/avulso e cadastro do paciente. Os filtros não ficam salvos.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Status } from "@/lib/agenda/dados";
import { type FiltroDeGuia, type Filtros, type ModoDoFiltro, type NivelCadastral } from "@/lib/agenda/filtros";
import { paraBusca } from "@/lib/pacientes";
import { pacientesParaFiltro } from "./actions-filtros";
import { IconeGuia } from "./icone-guia";

export type OpcoesDosFiltros = {
  /** Planos e tipos que aparecem no período carregado ("" = sem plano / sem tipo). */
  planos: { nome: string; cor: string | null }[];
  tipos: string[];
};

const STATUS: [Status, string][] = [
  ["marcado", "Marcado"],
  ["confirmado", "Confirmado"],
  ["atendido", "Atendido"],
  ["faltou", "Faltou"],
  ["desmarcado", "Desmarcado"],
];
const GUIAS: [FiltroDeGuia, string][] = [
  ["ok", "Guia em dia"],
  ["vencendo", "Guia perto do fim"],
  ["falta", "Sem guia (plano exige)"],
  ["sem", "Sem ícone de guia"],
];
const CADASTRO: [NivelCadastral, string, string][] = [
  ["completo", "Completo", "bg-emerald-500"],
  ["falta_informacao", "Falta informação", "bg-amber-400"],
  ["critico", "Crítico", "bg-red-500"],
];

type Props = {
  filtros: Filtros;
  aoMudar: (f: Filtros) => void;
  modo: ModoDoFiltro;
  aoMudarModo: (m: ModoDoFiltro) => void;
  ajustarAgenda: boolean;
  aoAjustarAgenda: (v: boolean) => void;
  opcoes: OpcoesDosFiltros;
};

/** Liga/desliga um valor numa lista. */
const alternar = <T,>(lista: T[], valor: T) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);

export function FiltrosAvancados({ filtros: f, aoMudar, modo, aoMudarModo, ajustarAgenda, aoAjustarAgenda, opcoes }: Props) {
  const mudar = (parcial: Partial<Filtros>) => aoMudar({ ...f, ...parcial });

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">O que não combina</legend>
        <div role="radiogroup" aria-label="O que não combina" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1">
          {(
            [
              ["esmaecer", "Esmaecer"],
              ["esconder", "Esconder"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={modo === valor}
              onClick={() => aoMudarModo(valor)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[13px] transition ${modo === valor ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{modo === "esmaecer" ? "Fica apagado, ocupando o horário." : "Some da agenda."}</p>
        {/* Só ao esconder: ao esmaecer, a grade fica inteira, com os cards apagados no lugar. */}
        {modo === "esconder" && (
          <label className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1 text-sm hover:bg-background">
            <input type="checkbox" checked={ajustarAgenda} onChange={(e) => aoAjustarAgenda(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
            <span className="leading-tight">
              Ajustar a agenda ao filtro
              <span className="block text-xs text-muted">Tira as colunas e condensa os horários sem resultado.</span>
            </span>
          </label>
        )}
      </fieldset>

      <Pacientes selecionados={f.pacientes} aoMudar={(pacientes) => mudar({ pacientes })} />

      {opcoes.planos.length > 0 && (
        <Grupo titulo="Plano">
          {opcoes.planos.map((p) => (
            <Opcao key={p.nome} marcado={f.planos.includes(p.nome)} aoMudar={() => mudar({ planos: alternar(f.planos, p.nome) })}>
              <span className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: p.cor ?? "#9ca3af" }} />
              {p.nome || "Sem plano"}
            </Opcao>
          ))}
        </Grupo>
      )}

      <Grupo titulo="Guia">
        {GUIAS.map(([valor, rotulo]) => (
          <Opcao key={valor} marcado={f.guias.includes(valor)} aoMudar={() => mudar({ guias: alternar(f.guias, valor) })}>
            {valor === "sem" ? <span className="size-4 shrink-0" /> : <IconeGuia situacao={valor} tamanho={16} />}
            {rotulo}
          </Opcao>
        ))}
      </Grupo>

      <Grupo titulo="Status do atendimento">
        {STATUS.map(([valor, rotulo]) => (
          <Opcao key={valor} marcado={f.status.includes(valor)} aoMudar={() => mudar({ status: alternar(f.status, valor) })}>
            {rotulo}
          </Opcao>
        ))}
      </Grupo>

      {opcoes.tipos.length > 0 && (
        <Grupo titulo="Tipo">
          {opcoes.tipos.map((t) => (
            <Opcao key={t} marcado={f.tipos.includes(t)} aoMudar={() => mudar({ tipos: alternar(f.tipos, t) })}>
              {t || "Sem tipo"}
            </Opcao>
          ))}
        </Grupo>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Série</legend>
        {(
          [
            ["todos", "Todos"],
            ["serie", "Só atendimentos em série"],
            ["avulso", "Só avulsos"],
          ] as const
        ).map(([valor, rotulo]) => (
          <label key={valor} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-background">
            <input type="radio" name="filtro-serie" checked={f.serie === valor} onChange={() => mudar({ serie: valor })} className="accent-[var(--accent)]" />
            {rotulo}
          </label>
        ))}
      </fieldset>

      <Grupo titulo="Cadastro do paciente">
        {CADASTRO.map(([valor, rotulo, cor]) => (
          <Opcao key={valor} marcado={f.cadastro.includes(valor)} aoMudar={() => mudar({ cadastro: alternar(f.cadastro, valor) })}>
            <span className={`size-2.5 shrink-0 rounded-full ${cor}`} />
            {rotulo}
          </Opcao>
        ))}
      </Grupo>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function Opcao({ marcado, aoMudar, children }: { marcado: boolean; aoMudar: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-sm hover:bg-background">
      <input type="checkbox" checked={marcado} onChange={aoMudar} className="size-4 shrink-0 accent-[var(--accent)]" />
      {children}
    </label>
  );
}

/** Pacientes escolhidos (chips) e o "+" que abre a barra de pesquisa. */
function Pacientes({ selecionados, aoMudar }: { selecionados: Filtros["pacientes"]; aoMudar: (p: Filtros["pacientes"]) => void }) {
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState("");
  const [todos, setTodos] = useState<{ id: string; nome: string }[] | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  // Lista de pacientes ativos: carregada ao abrir a pesquisa pela primeira vez.
  useEffect(() => {
    if (!buscando || todos) return;
    let ativo = true;
    pacientesParaFiltro()
      .then((p) => ativo && setTodos(p))
      .catch(() => ativo && setTodos([]));
    return () => {
      ativo = false;
    };
  }, [buscando, todos]);

  const t = paraBusca(termo);
  const resultados = t.length >= 2 && todos ? todos.filter((p) => !selecionados.some((s) => s.id === p.id) && paraBusca(p.nome).includes(t)).slice(0, 8) : [];

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Paciente</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {selecionados.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-3 text-sm text-accent">
            {p.nome}
            <button
              type="button"
              onClick={() => aoMudar(selecionados.filter((x) => x.id !== p.id))}
              className="rounded-full px-1.5 hover:bg-accent/10"
              aria-label={`Tirar ${p.nome} do filtro`}
            >
              ×
            </button>
          </span>
        ))}
        {!buscando && (
          <button
            type="button"
            onClick={() => {
              setBuscando(true);
              setTimeout(() => campo.current?.focus(), 0);
            }}
            className="inline-flex size-8 items-center justify-center rounded-full bg-black/[0.04] text-lg leading-none hover:bg-black/[0.07]"
            aria-label="Adicionar paciente ao filtro"
            title="Adicionar paciente"
          >
            +
          </button>
        )}
      </div>
      {buscando && (
        <div className="relative">
          <input
            ref={campo}
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setBuscando(false);
                setTermo("");
              }
            }}
            placeholder="Pesquisar paciente…"
            aria-label="Pesquisar paciente"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          {resultados.length > 0 && (
            <ul role="listbox" aria-label="Pacientes encontrados" className="mt-1 flex flex-col rounded-xl bg-surface p-1 shadow-lg ring-1 ring-black/10">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      aoMudar([...selecionados, p]);
                      setTermo("");
                      setBuscando(false);
                    }}
                    className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-background"
                  >
                    {p.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {t.length >= 2 && todos && resultados.length === 0 && <p className="mt-1 px-1 text-xs text-muted">Nenhum paciente encontrado.</p>}
        </div>
      )}
    </fieldset>
  );
}

