"use client";

// Inativação pedida pelo profissional (aviso e decisão da recepção) e exclusão dos
// atendimentos de agora em diante, pelo menu do paciente.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FUSO } from "@/lib/agenda/tempo";
import { atendimentosFuturos, decidirInativacao, excluirFuturos, type Decisao, type FuturosPorProfissional } from "../actions-inativacao";

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export type PedidoDeInativacao = {
  id: string;
  pedidoPor: string;
  motivo: string;
  pedidoEm: string;
  /** Atendimentos do pedido que ainda esperam a decisão. */
  atendimentos: number;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const seus = (n: number) => (n === 1 ? "O seu atendimento" : `Os seus ${n} atendimentos`);

/** Os atendimentos de agora em diante, carregados ao abrir. */
function useFuturos(pacienteId: string) {
  const [futuros, setFuturos] = useState<FuturosPorProfissional[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    atendimentosFuturos(pacienteId)
      .then((f) => ativo && setFuturos(f))
      .catch(() => ativo && setErro("Não foi possível carregar os atendimentos."));
    return () => {
      ativo = false;
    };
  }, [pacienteId]);
  return { futuros, erro };
}

/** No painel de edição, quando o profissional desmarca "Ativo". */
export function AvisoDeInativacao({ pacienteId, nome, motivo, aoMudarMotivo }: { pacienteId: string; nome: string; motivo: string; aoMudarMotivo: (m: string) => void }) {
  const { futuros, erro } = useFuturos(pacienteId);
  const meus = futuros?.reduce((soma, f) => soma + f.quantidade, 0) ?? null;
  return (
    <div role="alert" className="col-span-2 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
      <p className="font-medium">Inativar {nome}</p>
      <p>
        {erro ??
          (meus === null
            ? "Conferindo os seus atendimentos…"
            : meus === 0
              ? "Você não tem atendimentos com este paciente de agora em diante."
              : `${seus(meus)} com este paciente de agora em diante também ${meus === 1 ? "será excluído" : "serão excluídos"}.`)}
      </p>
      <p className="text-xs">O paciente sai da sua lista na hora e fica em &quot;Inativos&quot;. A recepção ou um administrador confirma a inativação e as exclusões.</p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold tracking-wide uppercase">Motivo</span>
        <textarea value={motivo} onChange={(e) => aoMudarMotivo(e.target.value)} rows={2} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-amber-200" />
      </label>
    </div>
  );
}

/** Recepção e ADM: um quadro por pedido em aberto, com as três decisões. */
export function PedidosDeInativacao({ pacienteId, pedidos }: { pacienteId: string; pedidos: PedidoDeInativacao[] }) {
  return pedidos.map((p) => <QuadroDoPedido key={p.id} pacienteId={pacienteId} pedido={p} />);
}

function QuadroDoPedido({ pacienteId, pedido: p }: { pacienteId: string; pedido: PedidoDeInativacao }) {
  const router = useRouter();
  const [trabalhando, setTrabalhando] = useState<Decisao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(decisao: Decisao) {
    setTrabalhando(decisao);
    setErro(null);
    const r = await decidirInativacao(p.id, pacienteId, decisao).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(null);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  const excluir = p.atendimentos > 0 ? ` e excluir ${plural(p.atendimentos, "atendimento", "atendimentos")}` : "";
  return (
    <section aria-label="Pedido de inativação" className="flex flex-col gap-3 rounded-3xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
      <div>
        <p className="font-semibold">
          {p.pedidoPor} pediu para inativar este paciente · {dataHora.format(new Date(p.pedidoEm))}
        </p>
        <p className="whitespace-pre-wrap">{p.motivo}</p>
        <p className="mt-1 text-xs">
          {p.atendimentos > 0
            ? `${plural(p.atendimentos, "atendimento futuro", "atendimentos futuros")} de ${p.pedidoPor} com exclusão pedida. Eles aparecem esmaecidos na agenda e também podem ser decididos um a um por lá.`
            : "Sem atendimentos futuros com exclusão pedida."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!trabalhando} onClick={() => void decidir("inativar")} className="rounded-full bg-danger px-4 py-2 font-medium text-white disabled:opacity-50">
          {trabalhando === "inativar" ? "Salvando…" : `Inativar${excluir}`}
        </button>
        {p.atendimentos > 0 && (
          <button type="button" disabled={!!trabalhando} onClick={() => void decidir("manter")} className="rounded-full bg-white px-4 py-2 font-medium ring-1 ring-amber-300 hover:bg-amber-100 disabled:opacity-50">
            {trabalhando === "manter" ? "Salvando…" : "Manter o paciente e só excluir os atendimentos"}
          </button>
        )}
        <button type="button" disabled={!!trabalhando} onClick={() => void decidir("recusar")} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07] disabled:opacity-50">
          {trabalhando === "recusar" ? "Salvando…" : "Recusar o pedido"}
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}

/** Pelo menu do paciente: recepção e ADM excluem; o profissional pede a exclusão dos dele. */
export function PainelExcluirFuturos({ pacienteId, nome, profissional, aoFechar }: { pacienteId: string; nome: string; profissional: boolean; aoFechar: () => void }) {
  const router = useRouter();
  const { futuros, erro: erroCarga } = useFuturos(pacienteId);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<number | null>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const escolhidos = futuros?.filter((f) => !desmarcados.has(f.id)) ?? [];
  const total = escolhidos.reduce((soma, f) => soma + f.quantidade, 0);
  const todos = !!futuros && escolhidos.length === futuros.length;

  async function confirmar() {
    setTrabalhando(true);
    setErro(null);
    // Todos marcados: inclui também atendimentos sem profissional.
    const r = await excluirFuturos(pacienteId, profissional || todos ? null : escolhidos.map((f) => f.id), motivo).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    setFeito(r.quantidade);
    router.refresh();
  }

  const titulo = profissional ? "Pedir exclusão dos atendimentos" : "Excluir atendimentos";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{titulo}</h2>
            <p className="truncate text-sm text-muted">{nome} · de agora em diante</p>
          </div>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
            {feito !== null ? (
              <p role="status" className="rounded-xl bg-accent-soft p-3 text-accent">
                {profissional
                  ? `Exclusão pedida para ${plural(feito, "atendimento", "atendimentos")}. A recepção ou um administrador confirma.`
                  : `${plural(feito, "atendimento excluído", "atendimentos excluídos")}.`}
              </p>
            ) : erroCarga ? (
              <p className="text-danger">{erroCarga}</p>
            ) : !futuros ? (
              <p className="text-muted">Carregando…</p>
            ) : futuros.length === 0 ? (
              <p className="text-muted">{profissional ? "Você não tem atendimentos com este paciente de agora em diante." : "Nenhum atendimento de agora em diante."}</p>
            ) : (
              <>
                {profissional ? (
                  <p>
                    {seus(futuros[0].quantidade)} com {nome} de agora em diante {futuros[0].quantidade === 1 ? "sai" : "saem"} da sua agenda. A recepção ou um administrador confirma a exclusão.
                  </p>
                ) : (
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Profissionais</legend>
                    {futuros.map((f) => (
                      <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-background">
                        <input
                          type="checkbox"
                          checked={!desmarcados.has(f.id)}
                          onChange={(e) => {
                            const novo = new Set(desmarcados);
                            if (e.target.checked) novo.delete(f.id);
                            else novo.add(f.id);
                            setDesmarcados(novo);
                          }}
                          className="size-4 accent-[var(--accent)]"
                        />
                        <span className="flex-1">{f.nome}</span>
                        <span className="text-muted tabular-nums">{plural(f.quantidade, "atendimento", "atendimentos")}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-muted uppercase">Motivo</span>
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="rounded-xl border border-border bg-surface px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft" />
                </label>
                <p className="text-xs text-muted">Os atendimentos que já aconteceram não mudam. Os excluídos saem da agenda, mas ficam guardados.</p>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
            {erro && (
              <p role="alert" className="mr-auto text-sm text-danger">
                {erro}
              </p>
            )}
            <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
              {feito !== null ? "Fechar" : "Cancelar"}
            </button>
            {feito === null && !!futuros?.length && (
              <button type="submit" disabled={trabalhando || total === 0 || !motivo.trim()} className="rounded-full bg-danger px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
                {trabalhando ? "Salvando…" : profissional ? `Pedir exclusão de ${plural(total, "atendimento", "atendimentos")}` : `Excluir ${plural(total, "atendimento", "atendimentos")}`}
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}
