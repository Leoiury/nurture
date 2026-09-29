"use client";

// Histórico do paciente em cards (por mês), com filtros e resumo de presença;
// os próximos atendimentos ficam num bloco à parte. Clicar num card abre o mesmo
// painel da agenda (detalhes, status, editar, desmarcar, observações).

import { useState } from "react";
import type { Status } from "@/lib/agenda/dados";
import { FUSO, nomeDoMes, partesNoFuso } from "@/lib/agenda/tempo";
import { nomeAbreviado } from "../../agenda/comum";
import { PainelAtendimento } from "../../agenda/painel-atendimento";
import { PainelNovoAtendimento, type DadosEdicao } from "../../agenda/painel-novo-atendimento";

export type AtendimentoDoHistorico = {
  id: string;
  inicio: string;
  fim: string;
  status: Status;
  motivoDesmarcacao: string | null;
  emSerie: boolean;
  profissionais: string[];
  tipo: string | null;
  plano: { nome: string; cor: string } | null;
  observacoes: number;
};

type Filtro = "todos" | "atendido" | "faltou" | "desmarcado" | "sem-registro";

const ROTULO_STATUS: Record<Status, string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  faltou: "Faltou",
  desmarcado: "Desmarcado",
};

const ESTILO_STATUS: Record<Status, string> = {
  marcado: "bg-black/5 text-muted",
  confirmado: "bg-sky-100 text-sky-800",
  atendido: "bg-accent-soft text-accent",
  faltou: "bg-red-100 text-red-800",
  desmarcado: "bg-black/5 text-muted line-through",
};

const partesDoDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "short" });
/** "Ter, 29 set" */
function dia(instante: Date): string {
  const p = Object.fromEntries(partesDoDia.formatToParts(instante).map((x) => [x.type, x.value.replace(".", "")]));
  return `${p.weekday.charAt(0).toUpperCase()}${p.weekday.slice(1)}, ${p.day} ${p.month}`;
}
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

export function HistoricoDoPaciente({ atendimentos }: { atendimentos: AtendimentoDoHistorico[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<DadosEdicao | null>(null);
  const [todosProximos, setTodosProximos] = useState(false);

  const agora = new Date().toISOString();
  const futuro = (a: AtendimentoDoHistorico) => a.inicio > agora && (a.status === "marcado" || a.status === "confirmado");
  const proximos = atendimentos.filter(futuro).reverse();
  const passados = atendimentos.filter((a) => !futuro(a));

  const contagem = {
    atendido: passados.filter((a) => a.status === "atendido").length,
    faltou: passados.filter((a) => a.status === "faltou").length,
    desmarcado: passados.filter((a) => a.status === "desmarcado").length,
    // Já passou e continua "marcado"/"confirmado": ninguém registrou se aconteceu.
    semRegistro: passados.filter((a) => a.status === "marcado" || a.status === "confirmado").length,
  };
  const presenca = contagem.atendido + contagem.faltou > 0 ? Math.round((100 * contagem.atendido) / (contagem.atendido + contagem.faltou)) : null;

  const filtrados = passados.filter((a) =>
    filtro === "todos" ? true : filtro === "sem-registro" ? a.status === "marcado" || a.status === "confirmado" : a.status === filtro,
  );
  const porMes = new Map<string, AtendimentoDoHistorico[]>();
  for (const a of filtrados) {
    const mes = partesNoFuso(a.inicio).data.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), a]);
  }

  const filtros: [Filtro, string, number][] = [
    ["todos", "Todos", passados.length],
    ["atendido", "Atendidos", contagem.atendido],
    ["faltou", "Faltas", contagem.faltou],
    ["desmarcado", "Desmarcados", contagem.desmarcado],
    ...(contagem.semRegistro ? ([["sem-registro", "Sem registro", contagem.semRegistro]] as [Filtro, string, number][]) : []),
  ];

  return (
    <>
      {proximos.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Próximos atendimentos">
          <h2 className="font-semibold">Próximos</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(todosProximos ? proximos : proximos.slice(0, 6)).map((a) => (
              <li key={a.id}>
                <CardDoHistorico atendimento={a} aoAbrir={() => setAberto(a.id)} />
              </li>
            ))}
          </ul>
          {proximos.length > 6 && (
            <button type="button" onClick={() => setTodosProximos(!todosProximos)} className="self-start text-sm text-accent hover:underline">
              {todosProximos ? "Mostrar só os 6 primeiros" : `Ver todos os ${proximos.length} marcados`}
            </button>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4" aria-label="Histórico">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Histórico</h2>
            {presenca !== null && (
              <p className="text-sm text-muted">
                Presença de {presenca}% ({contagem.atendido} atendido{contagem.atendido === 1 ? "" : "s"}, {contagem.faltou} falta
                {contagem.faltou === 1 ? "" : "s"})
              </p>
            )}
          </div>
          <div role="radiogroup" aria-label="Filtrar histórico" className="flex flex-wrap gap-0.5 rounded-full bg-black/[0.04] p-1">
            {filtros.map(([valor, rotulo, n]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={filtro === valor}
                onClick={() => setFiltro(valor)}
                className={`rounded-full px-3 py-1 text-sm ${filtro === valor ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {rotulo} <span className="text-xs text-muted">{n}</span>
              </button>
            ))}
          </div>
        </div>

        {porMes.size === 0 && (
          <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">
            {passados.length === 0 ? "Nenhum atendimento registrado ainda." : "Nenhum atendimento com esse filtro."}
          </p>
        )}
        {[...porMes].map(([mes, lista]) => (
          <div key={mes} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted">{nomeDoMes(`${mes}-01`)}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((a) => (
                <li key={a.id}>
                  <CardDoHistorico atendimento={a} aoAbrir={() => setAberto(a.id)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {aberto && (
        <PainelAtendimento
          key={aberto}
          id={aberto}
          mostrarLinkDoPaciente={false}
          aoFechar={() => setAberto(null)}
          aoEditar={(dados) => {
            setAberto(null);
            setEditando(dados);
          }}
        />
      )}
      {editando && <PainelNovoAtendimento key={editando.id} edicao={editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function CardDoHistorico({ atendimento: a, aoAbrir }: { atendimento: AtendimentoDoHistorico; aoAbrir: () => void }) {
  const cor = a.plano?.cor ?? "#9ca3af";
  const inicio = new Date(a.inicio);
  return (
    <button
      type="button"
      onClick={aoAbrir}
      data-atendimento={a.id}
      className="relative flex w-full flex-col gap-1.5 overflow-hidden rounded-2xl bg-surface py-3 pr-3 pl-5 text-left text-sm shadow-sm ring-1 ring-black/5 transition hover:-translate-y-px hover:shadow-md"
    >
      <span className="absolute inset-y-2 left-2 w-1 rounded-full" style={{ background: cor }} aria-hidden />
      <span className="flex items-start justify-between gap-2">
        <span>
          <span className="block font-semibold">{dia(inicio)}</span>
          <span className="block text-xs tabular-nums text-muted">
            {hora.format(inicio)} – {hora.format(new Date(a.fim))}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTILO_STATUS[a.status]}`}>{ROTULO_STATUS[a.status]}</span>
      </span>
      <span className="truncate">{a.tipo ?? "Atendimento"}</span>
      <span className="truncate text-xs text-muted">
        {a.profissionais.map(nomeAbreviado).join(", ")}
        {a.plano && ` · ${a.plano.nome}`}
      </span>
      {(a.motivoDesmarcacao && a.status === "desmarcado") || a.observacoes > 0 || a.emSerie ? (
        <span className="flex flex-wrap gap-x-2 text-[11px] text-muted">
          {a.status === "desmarcado" && a.motivoDesmarcacao && <span className="truncate">{a.motivoDesmarcacao}</span>}
          {a.observacoes > 0 && <span>{a.observacoes} observaç{a.observacoes === 1 ? "ão" : "ões"}</span>}
          {a.emSerie && <span>série</span>}
        </span>
      ) : null}
    </button>
  );
}
