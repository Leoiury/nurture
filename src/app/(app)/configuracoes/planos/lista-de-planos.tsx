"use client";

import { useEffect, useState } from "react";
import { PALETA_PLANOS } from "@/lib/agenda/cores";
import { lerValor } from "@/lib/agenda/valores";
import { excluirPlano, salvarPlano } from "./actions";

export type PlanoDaLista = {
  id: string;
  nome: string;
  cor: string;
  duracaoMin: number;
  valor: number | null;
  ativo: boolean;
  atendimentos: number;
  pacientes: number;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

export function ListaDePlanos({ planos }: { planos: PlanoDaLista[] }) {
  const [editando, setEditando] = useState<PlanoDaLista | "novo" | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditando("novo")}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          + Novo plano
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5" aria-label="Planos">
        {planos.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setEditando(p)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-background ${p.ativo ? "" : "opacity-60"}`}
            >
              <span className="size-4 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: p.cor }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {p.nome}
                  {!p.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-px text-[11px] font-normal text-muted">inativo</span>}
                </span>
                <span className="text-muted">
                  {p.duracaoMin} min · {p.valor != null ? moeda.format(p.valor) : "sem valor padrão"}
                </span>
              </span>
              <span className="hidden text-right text-xs text-muted sm:block">
                {plural(p.atendimentos, "atendimento", "atendimentos")}
                <br />
                {plural(p.pacientes, "paciente", "pacientes")}
              </span>
            </button>
          </li>
        ))}
        {planos.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nenhum plano cadastrado.</li>}
      </ul>

      {editando && <PainelDoPlano key={editando === "novo" ? "novo" : editando.id} plano={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

const entrada =
  "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

function PainelDoPlano({ plano, aoFechar }: { plano: PlanoDaLista | null; aoFechar: () => void }) {
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [cor, setCor] = useState(plano?.cor ?? PALETA_PLANOS[0].hex);
  const [duracao, setDuracao] = useState(plano?.duracaoMin ?? 45);
  const [valor, setValor] = useState(plano?.valor != null ? String(plano.valor).replace(".", ",") : "");
  const [ativo, setAtivo] = useState(plano?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emUso = !!plano && plano.atendimentos + plano.pacientes > 0;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  async function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setSalvando(true);
    setErro(null);
    const r = await acao().catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  function salvar() {
    const v = lerValor(valor);
    if (v !== null && Number.isNaN(v)) return setErro("Valor inválido.");
    void executar(() => salvarPlano({ id: plano?.id, nome, cor, duracaoMin: duracao, valor: v, ativo }));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={plano ? "Editar plano" : "Novo plano"}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{plano ? "Editar plano" : "Novo plano"}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={`${entrada} w-full`} placeholder="Ex.: Unimed" />
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Cor</legend>
              <div className="grid grid-cols-7 gap-2" role="radiogroup" aria-label="Cor do plano">
                {PALETA_PLANOS.map((c) => {
                  const escolhida = c.hex.toLowerCase() === cor.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      role="radio"
                      aria-checked={escolhida}
                      aria-label={c.nome}
                      title={c.nome}
                      onClick={() => setCor(c.hex)}
                      className={`aspect-square rounded-lg ring-offset-2 transition ${escolhida ? "ring-2 ring-foreground" : "ring-1 ring-black/10 hover:scale-105"}`}
                      style={{ background: c.hex }}
                    />
                  );
                })}
              </div>
              {/* Como o card fica na agenda. */}
              <div
                className="relative mt-1 overflow-hidden rounded-xl py-2 pr-3 pl-4 ring-1 ring-black/[0.04]"
                style={{ background: `color-mix(in srgb, ${cor} 26%, white)` }}
                aria-label="Prévia do card"
              >
                <span className="absolute inset-y-1 left-1 w-1 rounded-full" style={{ background: cor }} aria-hidden />
                <span className="block text-[13px] font-semibold">Paciente exemplo</span>
                <span className="block text-[11px] text-muted">
                  09:00 – {String(9 + Math.floor(duracao / 60)).padStart(2, "0")}:{String(duracao % 60).padStart(2, "0")} · {nome || "Plano"}
                </span>
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Duração padrão (min)</span>
              <div className="flex items-center gap-1.5">
                {[30, 45, 60].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuracao(d)}
                    aria-pressed={duracao === d}
                    className={`rounded-full px-3 py-1.5 ${duracao === d ? "bg-accent text-white" : "bg-black/[0.04] hover:bg-black/[0.07]"}`}
                  >
                    {d}
                  </button>
                ))}
                <input
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  value={duracao}
                  onChange={(e) => setDuracao(Number(e.target.value))}
                  aria-label="Duração em minutos"
                  className={`${entrada} w-24`}
                />
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Valor padrão (R$)</span>
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Opcional" className={`${entrada} w-48`} />
            </label>

            {plano && (
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                <span>
                  Ativo
                  <span className="block text-xs text-muted">Inativo: some do formulário de atendimento, mas o histórico continua.</span>
                </span>
              </label>
            )}

            {plano && (
              <div className="mt-2 border-t border-border pt-4">
                {emUso ? (
                  <p className="text-xs text-muted">
                    Em uso por {plural(plano.atendimentos, "atendimento", "atendimentos")} e {plural(plano.pacientes, "paciente", "pacientes")}: para
                    tirá-lo do formulário, desative em vez de excluir.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => confirm(`Excluir o plano “${plano.nome}”?`) && void executar(() => excluirPlano(plano.id))}
                    className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
                  >
                    Excluir plano
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
            {erro && (
              <p role="alert" className="mr-auto text-sm text-danger">
                {erro}
              </p>
            )}
            <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !nome.trim()}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
