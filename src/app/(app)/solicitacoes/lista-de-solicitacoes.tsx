"use client";

// Lista dos pedidos dos profissionais, filtrável por profissional, com a decisão em cada um.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FUSO } from "@/lib/agenda/tempo";
import { decidirInativacao, type Decisao } from "../pacientes/actions-inativacao";
import { decidirExclusao } from "./actions";
import type { Solicitacao } from "./dados";

type Item = Solicitacao & { alvos: string[] };

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const doAtendimento = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const MOSTRAR = 6;

export function ListaDeSolicitacoes({ solicitacoes }: { solicitacoes: Item[] }) {
  const [profissional, setProfissional] = useState<string | null>(null);

  const profissionais = useMemo(() => {
    const contagem = new Map<string, { id: string; nome: string; quantidade: number }>();
    for (const s of solicitacoes) {
      if (!s.profissional) continue;
      const atual = contagem.get(s.profissional.id) ?? { ...s.profissional, quantidade: 0 };
      atual.quantidade += 1;
      contagem.set(s.profissional.id, atual);
    }
    return [...contagem.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [solicitacoes]);
  // O profissional escolhido pode sumir da lista depois de uma decisão.
  const escolhido = profissionais.some((p) => p.id === profissional) ? profissional : null;
  const visiveis = escolhido ? solicitacoes.filter((s) => s.profissional?.id === escolhido) : solicitacoes;

  if (solicitacoes.length === 0) {
    return <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhuma solicitação pendente.</p>;
  }

  return (
    <>
      <div role="radiogroup" aria-label="Profissional" className="flex flex-wrap gap-1.5">
        {[{ id: null, nome: "Todos", quantidade: solicitacoes.length }, ...profissionais].map((p) => (
          <button
            key={p.id ?? "todos"}
            type="button"
            role="radio"
            aria-checked={escolhido === p.id}
            onClick={() => setProfissional(p.id)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 transition ${
              escolhido === p.id ? "bg-surface font-medium shadow-sm ring-black/15" : "text-muted ring-black/5 hover:text-foreground"
            }`}
          >
            {p.nome}
            <span className="text-xs text-muted tabular-nums">{p.quantidade}</span>
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-3" aria-label="Solicitações">
        {visiveis.map((s) => (
          <ItemDaSolicitacao key={s.chave} solicitacao={s} />
        ))}
      </ul>
    </>
  );
}

function ItemDaSolicitacao({ solicitacao: s }: { solicitacao: Item }) {
  const router = useRouter();
  const [trabalhando, setTrabalhando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inativacao = s.tipo === "inativacao";
  const n = s.atendimentos.length;

  async function agir(acao: string, fazer: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setTrabalhando(acao);
    setErro(null);
    const r = await fazer().catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(null);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }
  const decidir = (d: Decisao) => agir(d, () => decidirInativacao(s.pedidoId!, s.paciente.id, d));
  const rotulo = (acao: string, texto: string) => (trabalhando === acao ? "Salvando…" : texto);

  return (
    <li aria-label={`${inativacao ? "Inativação" : "Exclusão"}: ${s.paciente.nome}`} className="flex flex-col gap-3 rounded-3xl bg-surface p-5 text-sm shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inativacao ? "bg-amber-100 text-amber-900" : "bg-red-50 text-danger ring-1 ring-red-200"}`}>
              {inativacao ? "Inativar paciente" : plural(n, "exclusão de atendimento", "exclusões de atendimentos")}
            </span>
            <Link href={`/pacientes/${s.paciente.id}`} className="font-semibold hover:text-accent">
              {s.paciente.nome}
            </Link>
          </p>
          <p className="mt-1 text-muted">
            {s.pedidoPor ?? s.profissional?.nome ?? "Profissional"}
            {s.pedidoPor && s.profissional && s.pedidoPor !== s.profissional.nome && ` (${s.profissional.nome})`} · {dataHora.format(new Date(s.pedidoEm))}
          </p>
        </div>
      </div>
      {s.motivo && <p className="whitespace-pre-wrap">{s.motivo}</p>}
      {n > 0 && (
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{inativacao ? `${plural(n, "atendimento futuro", "atendimentos futuros")} a excluir` : "Atendimentos"}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {s.atendimentos.slice(0, MOSTRAR).map((a) => (
              <li key={a.id} className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs tabular-nums first-letter:uppercase">
                {doAtendimento.format(new Date(a.inicio)).replace(",", "")}
              </li>
            ))}
            {n > MOSTRAR && <li className="px-1 py-1 text-xs text-muted">e mais {n - MOSTRAR}</li>}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {inativacao ? (
          <>
            <button type="button" disabled={!!trabalhando} onClick={() => void decidir("inativar")} className="rounded-full bg-danger px-4 py-2 font-medium text-white disabled:opacity-50">
              {rotulo("inativar", n > 0 ? `Inativar e excluir ${plural(n, "atendimento", "atendimentos")}` : "Inativar")}
            </button>
            {n > 0 && (
              <button type="button" disabled={!!trabalhando} onClick={() => void decidir("manter")} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07] disabled:opacity-50">
                {rotulo("manter", "Manter o paciente e só excluir os atendimentos")}
              </button>
            )}
            <button type="button" disabled={!!trabalhando} onClick={() => void decidir("recusar")} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07] disabled:opacity-50">
              {rotulo("recusar", "Recusar o pedido")}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={!!trabalhando} onClick={() => void agir("confirmar", () => decidirExclusao(s.alvos, true))} className="rounded-full bg-danger px-4 py-2 font-medium text-white disabled:opacity-50">
              {rotulo("confirmar", "Confirmar exclusão")}
            </button>
            <button type="button" disabled={!!trabalhando} onClick={() => void agir("recusar", () => decidirExclusao(s.alvos, false))} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07] disabled:opacity-50">
              {rotulo("recusar", "Recusar")}
            </button>
          </>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
