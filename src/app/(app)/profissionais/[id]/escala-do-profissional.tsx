"use client";

// Escala semanal do profissional: exibição e edição (intervalos por dia da semana).

import { useEffect, useState } from "react";
import { ESCALA_PADRAO, NOMES_DOS_DIAS, ORDEM_DOS_DIAS, problemaNoDia, type Escala, type Intervalo } from "@/lib/agenda/escala";
import { formatarHora } from "@/lib/agenda/tempo";
import { salvarEscala } from "../actions";

const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const descrever = (lista: Intervalo[] | undefined) => (lista?.length ? lista.map((i) => `${formatarHora(i.inicio)}–${formatarHora(i.fim)}`).join(", ") : "—");

/** `escala` null: sem escala própria (vale o expediente padrão). */
export function EscalaDoProfissional({ profissionalId, escala, podeEditar }: { profissionalId: string; escala: Escala | null; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const exibida = escala ?? ESCALA_PADRAO;
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5" aria-label="Escala semanal">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Escala semanal</h2>
        {podeEditar && (
          <button type="button" onClick={() => setEditando(true)} className="rounded-full bg-black/[0.04] px-3 py-1.5 text-sm font-medium hover:bg-black/[0.07]">
          Editar escala
        </button>
        )}
      </div>
      {!escala && <p className="text-xs text-muted">Sem escala cadastrada: vale o expediente padrão.</p>}
      <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1.5 text-sm">
        {ORDEM_DOS_DIAS.filter((d) => d !== 0 || exibida[0]?.length).map((d) => (
          <div key={d} className="contents">
            <dt className="text-muted">{NOMES_DOS_DIAS[d]}</dt>
            <dd className={`tabular-nums ${exibida[d]?.length ? "" : "text-muted"}`}>{descrever(exibida[d])}</dd>
          </div>
        ))}
      </dl>
      {editando && <PainelDaEscala profissionalId={profissionalId} escala={escala} aoFechar={() => setEditando(false)} />}
    </section>
  );
}

const entrada = "rounded-lg border border-border bg-surface px-2 py-1 text-sm tabular-nums outline-none focus:border-accent";

function PainelDaEscala({ profissionalId, escala, aoFechar }: { profissionalId: string; escala: Escala | null; aoFechar: () => void }) {
  const [dias, setDias] = useState<Escala>(() => structuredClone(escala ?? {}));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const mudar = (dia: number, lista: Intervalo[]) => setDias({ ...dias, [dia]: lista });
  const copiarSegunda = () => setDias({ ...dias, ...Object.fromEntries([2, 3, 4, 5].map((d) => [d, structuredClone(dias[1] ?? [])])) });

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await salvarEscala(profissionalId, dias).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  const vazia = Object.values(dias).every((l) => !l?.length);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label="Editar escala" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Escala semanal</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setDias(structuredClone(ESCALA_PADRAO))} className="rounded-full bg-black/[0.04] px-3 py-1.5 hover:bg-black/[0.07]">
              Preencher com o padrão
            </button>
            <button type="button" onClick={copiarSegunda} className="rounded-full bg-black/[0.04] px-3 py-1.5 hover:bg-black/[0.07]">
              Copiar segunda para ter–sex
            </button>
            <button type="button" onClick={() => setDias({})} className="rounded-full bg-black/[0.04] px-3 py-1.5 hover:bg-black/[0.07]">
              Limpar
            </button>
          </div>
          {ORDEM_DOS_DIAS.map((d) => {
            const lista = dias[d] ?? [];
            const problema = problemaNoDia(lista);
            return (
              <fieldset key={d} className="flex flex-col gap-1.5" aria-label={NOMES_DOS_DIAS[d]}>
                <legend className="mb-1 flex w-full items-center justify-between">
                  <span className="font-medium">{NOMES_DOS_DIAS[d]}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const ultimo = lista.at(-1);
                      mudar(d, [...lista, ultimo ? { inicio: Math.min(ultimo.fim + 60, 23 * 60), fim: Math.min(ultimo.fim + 5 * 60, 24 * 60 - 1) } : { inicio: 8 * 60, fim: 12 * 60 }]);
                    }}
                    className="text-xs text-accent hover:underline"
                  >
                    + intervalo
                  </button>
                </legend>
                {lista.length === 0 && <p className="text-xs text-muted">Não trabalha</p>}
                {lista.map((i, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <input
                      type="time"
                      step={900}
                      value={formatarHora(i.inicio)}
                      onChange={(e) => e.target.value && mudar(d, lista.map((x, j) => (j === k ? { ...x, inicio: minutos(e.target.value) } : x)))}
                      aria-label={`${NOMES_DOS_DIAS[d]}: início do intervalo ${k + 1}`}
                      className={entrada}
                    />
                    <span className="text-muted">até</span>
                    <input
                      type="time"
                      step={900}
                      value={formatarHora(i.fim)}
                      onChange={(e) => e.target.value && mudar(d, lista.map((x, j) => (j === k ? { ...x, fim: minutos(e.target.value) } : x)))}
                      aria-label={`${NOMES_DOS_DIAS[d]}: fim do intervalo ${k + 1}`}
                      className={entrada}
                    />
                    <button
                      type="button"
                      onClick={() => mudar(d, lista.filter((_, j) => j !== k))}
                      aria-label={`Remover intervalo ${k + 1} de ${NOMES_DOS_DIAS[d]}`}
                      className="rounded-full px-2 py-1 text-muted hover:bg-background hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {problema && <p className="text-xs text-danger">{problema}</p>}
              </fieldset>
            );
          })}
          {vazia && <p className="rounded-xl bg-black/[0.03] px-3 py-2 text-xs text-muted">Sem nenhum intervalo, vale o expediente padrão (seg–sex, 08–12 e 13–18).</p>}
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
            type="button"
            disabled={salvando}
            onClick={() => void salvar()}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar escala"}
          </button>
        </div>
      </aside>
    </>
  );
}
