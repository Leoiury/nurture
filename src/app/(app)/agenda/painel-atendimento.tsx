"use client";

import { useEffect, useState } from "react";
import type { Status } from "@/lib/agenda/dados";
import { FUSO } from "@/lib/agenda/tempo";
import { detalhesAtendimento, type DetalhesAtendimento } from "./actions";

const ROTULO_STATUS: Record<Status, string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  atendido: "Atendido",
  faltou: "Faltou",
  desmarcado: "Desmarcado",
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "2-digit" });
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function idade(nascimento: string): string {
  const [a, m, d] = nascimento.split("-").map(Number);
  const hoje = new Date();
  let anos = hoje.getFullYear() - a;
  let meses = hoje.getMonth() + 1 - m;
  if (hoje.getDate() < d) meses--;
  if (meses < 0) {
    anos--;
    meses += 12;
  }
  if (anos === 0) return plural(meses, "mês", "meses");
  return plural(anos, "ano", "anos") + (meses ? ` e ${plural(meses, "mês", "meses")}` : "");
}

type Props = { id: string; aoFechar: () => void };

export function PainelAtendimento({ id, aoFechar }: Props) {
  const [dados, setDados] = useState<DetalhesAtendimento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    detalhesAtendimento(id)
      .then((d) => {
        if (ativo) setDados(d);
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [id]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const a = dados?.atendimento;
  const p = a?.paciente;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do atendimento"
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Atendimento</p>
            <h2 className="truncate text-lg font-semibold">{a ? (p?.nome ?? "Sem paciente") : erro ? "Erro" : "Carregando…"}</h2>
          </div>
          <button type="button" onClick={aoFechar} className="rounded-md px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        {erro && <p className="p-5 text-sm text-danger">{erro}</p>}

        {a && (
          <div className="flex flex-col gap-6 p-5 text-sm">
            <section className="flex flex-col gap-2">
              <p className="first-letter:uppercase">
                {dataHora.format(new Date(a.inicio))} – {hora.format(new Date(a.fim))}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted">Profissional</dt>
                <dd>{a.profissional?.nome}</dd>
                <dt className="text-muted">Plano</dt>
                <dd className="flex items-center gap-1.5">
                  {a.plano && <span className="inline-block size-3 rounded-sm" style={{ background: a.plano.cor }} />}
                  {a.plano?.nome ?? "—"}
                </dd>
                <dt className="text-muted">Tipo</dt>
                <dd>{a.tipo?.nome ?? "—"}</dd>
                <dt className="text-muted">Valor</dt>
                <dd>{a.valor != null ? moeda.format(a.valor) : "—"}</dd>
                <dt className="text-muted">Status</dt>
                <dd>{ROTULO_STATUS[a.status]}</dd>
                {a.observacao && (
                  <>
                    <dt className="text-muted">Observação</dt>
                    <dd>{a.observacao}</dd>
                  </>
                )}
              </dl>
              <p className="mt-1 text-xs text-muted">Edição, exclusão e arrastar para outro horário chegam na próxima etapa.</p>
            </section>

            {p && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">Paciente</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  {p.data_nascimento && (
                    <>
                      <dt className="text-muted">Idade</dt>
                      <dd>
                        {idade(p.data_nascimento)}{" "}
                        <span className="text-muted">({p.data_nascimento.split("-").reverse().join("/")})</span>
                      </dd>
                    </>
                  )}
                  {p.responsavel && (
                    <>
                      <dt className="text-muted">Responsável</dt>
                      <dd>{p.responsavel}</dd>
                    </>
                  )}
                  {p.celular && (
                    <>
                      <dt className="text-muted">Celular</dt>
                      <dd>
                        <a href={`tel:${p.celular.replace(/\D/g, "")}`} className="text-accent hover:underline">
                          {p.celular}
                        </a>
                      </dd>
                    </>
                  )}
                  {p.email && (
                    <>
                      <dt className="text-muted">E-mail</dt>
                      <dd className="truncate">{p.email}</dd>
                    </>
                  )}
                  <dt className="text-muted">Plano padrão</dt>
                  <dd>{p.plano?.nome ?? "—"}</dd>
                </dl>
              </section>
            )}

            {p && dados && (
              <section className="flex flex-col gap-2">
                <h3 className="font-semibold">Histórico ({dados.historico.length})</h3>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {dados.historico.map((h) => (
                    <li key={h.id} className={`flex items-center gap-3 px-3 py-2 ${h.id === a.id ? "bg-accent-soft" : ""}`}>
                      <span className="w-16 shrink-0 tabular-nums text-muted">{dataCurta.format(new Date(h.inicio))}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {h.tipo?.nome ?? "—"} <span className="text-muted">· {h.profissional?.nome}</span>
                      </span>
                      <span
                        className={`shrink-0 text-xs ${h.status === "desmarcado" || h.status === "faltou" ? "text-danger" : "text-muted"}`}
                      >
                        {ROTULO_STATUS[h.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
