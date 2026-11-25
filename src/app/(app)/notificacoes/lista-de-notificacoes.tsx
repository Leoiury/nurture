"use client";

// Pendências (somem sozinhas quando resolvidas) e avisos (marcados como lidos), com
// filtro por profissional.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FUSO } from "@/lib/agenda/tempo";
import { PainelNovoAtendimento } from "../agenda/painel-novo-atendimento";
import { marcarComoLidas } from "./actions";
import type { Aviso, Pendencia } from "./dados";

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const doAtendimento = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const MOSTRAR = 6;

const cartao = "flex flex-col gap-2 rounded-3xl bg-surface p-5 text-sm shadow-sm ring-1 ring-black/5";
const botaoSecundario = "rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07] disabled:opacity-50";

type Props = { pendencias: Pendencia[]; avisos: Aviso[]; profissional: boolean; tipoDevolutiva: string | null };

export function ListaDeNotificacoes({ pendencias, avisos, profissional, tipoDevolutiva }: Props) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // O profissional só recebe as pendências dele: o filtro serve à recepção e ao ADM.
  const profissionais = useMemo(() => {
    const todos = new Map<string, string>();
    for (const p of pendencias) for (const x of p.profissionais) todos.set(x.id, x.nome);
    for (const a of avisos) if (a.profissional) todos.set(a.profissional.id, a.profissional.nome);
    return [...todos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pendencias, avisos]);
  const escolhido = profissionais.some((p) => p.id === filtro) ? filtro : null;
  const pendenciasVisiveis = escolhido ? pendencias.filter((p) => p.profissionais.some((x) => x.id === escolhido)) : pendencias;
  const avisosVisiveis = escolhido ? avisos.filter((a) => a.profissional?.id === escolhido) : avisos;
  const naoLidos = avisosVisiveis.filter((a) => !a.lida);

  async function lidas(ids: string[]) {
    setErro(null);
    const r = await marcarComoLidas(ids).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  if (pendencias.length === 0 && avisos.length === 0) {
    return <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhuma notificação.</p>;
  }

  return (
    <>
      {!profissional && profissionais.length > 0 && (
        <div role="radiogroup" aria-label="Profissional" className="flex flex-wrap gap-1.5">
          {[{ id: null, nome: "Todos" }, ...profissionais].map((p) => (
            <button
              key={p.id ?? "todos"}
              type="button"
              role="radio"
              aria-checked={escolhido === p.id}
              onClick={() => setFiltro(p.id)}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${escolhido === p.id ? "bg-surface font-medium shadow-sm ring-black/15" : "text-muted ring-black/5 hover:text-foreground"}`}
            >
              {p.nome}
            </button>
          ))}
        </div>
      )}

      <section aria-label="Pendências" className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Pendências <span className="text-sm font-normal text-muted tabular-nums">{pendenciasVisiveis.length}</span>
        </h2>
        {pendenciasVisiveis.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma pendência.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pendenciasVisiveis.map((p) => (
              <ItemDaPendencia key={p.chave} pendencia={p} profissional={profissional} podeMarcar={!!tipoDevolutiva} aoMarcar={() => setMarcando(p.paciente.id)} />
            ))}
          </ul>
        )}
      </section>

      {!profissional && (
        <section aria-label="Avisos" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Avisos <span className="text-sm font-normal text-muted tabular-nums">{naoLidos.length} não lidos</span>
            </h2>
            {naoLidos.length > 1 && (
              <button type="button" onClick={() => void lidas(naoLidos.map((a) => a.id))} className={botaoSecundario}>
                Marcar todos como lidos
              </button>
            )}
          </div>
          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}
          {avisosVisiveis.length === 0 ? (
            <p className="text-sm text-muted">Nenhum aviso nos últimos 90 dias.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {avisosVisiveis.map((a) => (
                <ItemDoAviso key={a.id} aviso={a} aoLer={() => void lidas([a.id])} />
              ))}
            </ul>
          )}
        </section>
      )}

      {marcando && tipoDevolutiva && <PainelNovoAtendimento inicial={{ pacienteId: marcando, tipoId: tipoDevolutiva }} aoFechar={() => (setMarcando(null), router.refresh())} />}
    </>
  );
}

function textoDaDevolutiva(p: Extract<Pendencia, { tipo: "devolutiva" }>) {
  const desde = p.ultima ? "desde a última devolutiva" : "sem devolutiva";
  return p.motivos.map((m) =>
    m === "faltas"
      ? `${plural(p.faltas, "falta", "faltas")} nos últimos 30 dias`
      : m === "atendimentos"
        ? `${plural(p.atendimentos, "atendimento", "atendimentos")} ${desde}`
        : p.ultima
          ? `Última devolutiva em ${dataCurta.format(new Date(p.ultima))}, há mais de 1 mês`
          : "Mais de 1 mês sem devolutiva",
  );
}

function ItemDaPendencia({ pendencia: p, profissional, podeMarcar, aoMarcar }: { pendencia: Pendencia; profissional: boolean; podeMarcar: boolean; aoMarcar: () => void }) {
  const devolutiva = p.tipo === "devolutiva";
  const acabou = p.tipo === "guia" && p.restantes <= 0;
  return (
    <li aria-label={`${devolutiva ? "Devolutiva" : "Guia"}: ${p.paciente.nome}`} className={cartao}>
      <p className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${devolutiva ? "bg-sky-100 text-sky-900" : acabou ? "bg-red-50 text-danger ring-1 ring-red-200" : "bg-amber-100 text-amber-900"}`}>
          {devolutiva ? "Marcar devolutiva" : acabou ? "Guia acabou" : "Guia perto do fim"}
        </span>
        <Link href={`/pacientes/${p.paciente.id}`} className="font-semibold hover:text-accent">
          {p.paciente.nome}
        </Link>
      </p>
      {p.tipo === "devolutiva" ? (
        <ul className="list-inside list-disc text-foreground">
          {textoDaDevolutiva(p).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p>
          {p.plano ? `${p.plano}: ` : ""}
          {p.usadas} de {p.total} sessões usadas
          {p.agendadas > 0 && ` · ${plural(p.agendadas, "agendada", "agendadas")}`}
          {" · "}
          {p.restantes > 0 ? (p.restantes === 1 ? "resta 1" : `restam ${p.restantes}`) : "nenhuma restante"}
        </p>
      )}
      {p.profissionais.length > 0 && <p className="text-muted">{p.profissionais.map((x) => x.nome).join(", ")}</p>}
      <div className="flex flex-wrap gap-2">
        {devolutiva && podeMarcar && (
          <button type="button" onClick={aoMarcar} className="rounded-full bg-accent px-4 py-2 font-medium text-white hover:brightness-110">
            Marcar devolutiva
          </button>
        )}
        {!devolutiva && (
          <Link href={`/pacientes/${p.paciente.id}#guias`} className={botaoSecundario}>
            {profissional ? "Ver a guia" : "Renovar a guia"}
          </Link>
        )}
      </div>
    </li>
  );
}

function ItemDoAviso({ aviso: a, aoLer }: { aviso: Aviso; aoLer: () => void }) {
  const n = a.atendimentos.length;
  const quem = a.autor ?? a.profissional?.nome ?? "Um profissional";
  const paciente = a.paciente?.nome ?? "paciente";
  return (
    <li aria-label={`${a.tipo === "ocultacao" ? "Ocultou" : "Exclusão"}: ${paciente}`} className={`${cartao} ${a.lida ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p>
          {!a.lida && <span aria-label="Não lido" className="mr-2 inline-block size-2 rounded-full bg-accent align-middle" />}
          <span className="font-medium">{quem}</span>{" "}
          {a.tipo === "ocultacao" ? (
            <>
              ocultou{" "}
              {a.paciente ? (
                <Link href={`/pacientes/${a.paciente.id}`} className="font-medium hover:text-accent">
                  {paciente}
                </Link>
              ) : (
                paciente
              )}{" "}
              da própria lista{n > 0 ? ` e excluiu ${plural(n, "atendimento", "atendimentos")}` : ""}
            </>
          ) : (
            <>
              excluiu {plural(n, "atendimento", "atendimentos")} de{" "}
              {a.paciente ? (
                <Link href={`/pacientes/${a.paciente.id}`} className="font-medium hover:text-accent">
                  {paciente}
                </Link>
              ) : (
                paciente
              )}
            </>
          )}
        </p>
        <span className="text-xs text-muted">{dataHora.format(new Date(a.criadoEm))}</span>
      </div>
      {a.motivo && <p className="whitespace-pre-wrap text-muted">{a.motivo}</p>}
      {n > 0 && (
        <ul aria-label="Atendimentos" className="flex flex-wrap gap-1.5">
          {a.atendimentos.slice(0, MOSTRAR).map((x) => (
            <li key={x.id} className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs tabular-nums first-letter:uppercase">
              {doAtendimento.format(new Date(x.inicio)).replace(",", "")}
            </li>
          ))}
          {n > MOSTRAR && <li className="px-1 py-1 text-xs text-muted">e mais {n - MOSTRAR}</li>}
        </ul>
      )}
      {!a.lida && (
        <button type="button" onClick={aoLer} className={`${botaoSecundario} self-start`}>
          Marcar como lido
        </button>
      )}
    </li>
  );
}
