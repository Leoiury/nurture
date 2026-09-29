"use client";

import { useEffect, useState } from "react";
import { nomeAbreviado } from "../../agenda/comum";
import { excluirTipo, salvarTipo } from "./actions";

export type TipoDaLista = {
  id: string;
  nome: string;
  ativo: boolean;
  atendimentos: number;
  /** Quem atende; vazio = qualquer profissional. */
  profissionais: string[];
};

type Profissional = { id: string; nome: string; especialidade: string | null };

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

export function ListaDeTipos({ tipos, profissionais }: { tipos: TipoDaLista[]; profissionais: Profissional[] }) {
  const [editando, setEditando] = useState<TipoDaLista | "novo" | null>(null);
  const quemAtende = (t: TipoDaLista) => {
    const nomes = profissionais.filter((p) => t.profissionais.includes(p.id)).map((p) => nomeAbreviado(p.nome));
    return nomes.length ? nomes.join(", ") : "Qualquer profissional";
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditando("novo")}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          + Novo tipo
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5" aria-label="Tipos de atendimento">
        {tipos.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setEditando(t)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-background ${t.ativo ? "" : "opacity-60"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {t.nome}
                  {!t.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-px text-[11px] font-normal text-muted">inativo</span>}
                </span>
                <span className="block truncate text-muted">{quemAtende(t)}</span>
              </span>
              <span className="hidden text-right text-xs text-muted sm:block">{plural(t.atendimentos, "atendimento", "atendimentos")}</span>
            </button>
          </li>
        ))}
        {tipos.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nenhum tipo cadastrado.</li>}
      </ul>

      {editando && (
        <PainelDoTipo
          key={editando === "novo" ? "novo" : editando.id}
          tipo={editando === "novo" ? null : editando}
          profissionais={profissionais}
          aoFechar={() => setEditando(null)}
        />
      )}
    </>
  );
}

const entrada =
  "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

function PainelDoTipo({ tipo, profissionais, aoFechar }: { tipo: TipoDaLista | null; profissionais: Profissional[]; aoFechar: () => void }) {
  const [nome, setNome] = useState(tipo?.nome ?? "");
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true);
  // Guarda também vínculos com profissionais inativos (não aparecem aqui, mas não se perdem ao salvar).
  const [escolhidos, setEscolhidos] = useState<string[]>(tipo?.profissionais ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nenhumAtivo = !profissionais.some((p) => escolhidos.includes(p.id));

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

  const alternar = (id: string) => setEscolhidos(escolhidos.includes(id) ? escolhidos.filter((e) => e !== id) : [...escolhidos, id]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={tipo ? "Editar tipo" : "Novo tipo"}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{tipo ? "Editar tipo" : "Novo tipo"}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(() => salvarTipo({ id: tipo?.id, nome, ativo, profissionais: escolhidos }));
          }}
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={`${entrada} w-full`} placeholder="Ex.: Avaliação Psicológica" />
            </label>

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Quem atende</legend>
              {profissionais.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-background">
                  <input type="checkbox" checked={escolhidos.includes(p.id)} onChange={() => alternar(p.id)} className="size-4 accent-[var(--accent)]" />
                  <span className="flex-1">{p.nome}</span>
                  {p.especialidade && <span className="text-xs text-muted">{p.especialidade}</span>}
                </label>
              ))}
              <p className="mt-1 text-xs text-muted">
                {nenhumAtivo ? "Ninguém marcado: qualquer profissional atende este tipo." : "Usado para sugerir o tipo e buscar horários livres."}
              </p>
            </fieldset>

            {tipo && (
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                <span>
                  Ativo
                  <span className="block text-xs text-muted">Inativo: some do formulário de atendimento, mas o histórico continua.</span>
                </span>
              </label>
            )}

            {tipo && (
              <div className="mt-2 border-t border-border pt-4">
                {tipo.atendimentos > 0 ? (
                  <p className="text-xs text-muted">
                    Em uso por {plural(tipo.atendimentos, "atendimento", "atendimentos")}: para tirá-lo do formulário, desative em vez de excluir.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => confirm(`Excluir o tipo “${tipo.nome}”?`) && void executar(() => excluirTipo(tipo.id))}
                    className="text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
                  >
                    Excluir tipo
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
