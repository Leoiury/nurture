"use client";

// Pelo menu do paciente: a recepção e o ADM excluem os atendimentos de agora em diante
// (de todos ou dos profissionais escolhidos); o profissional exclui os dele e oculta o
// paciente da própria lista.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { atendimentosFuturos, excluirFuturos, ocultarPaciente, type FuturosPorProfissional } from "../actions-inativacao";

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
  const meus = futuros?.[0]?.quantidade ?? 0;

  async function confirmar() {
    setTrabalhando(true);
    setErro(null);
    const falha = { ok: false as const, erro: "Falha de conexão." };
    // Todos marcados: inclui também atendimentos sem profissional.
    const r = profissional
      ? await ocultarPaciente(pacienteId, motivo).catch(() => falha)
      : await excluirFuturos(pacienteId, todos ? null : escolhidos.map((f) => f.id), motivo).catch(() => falha);
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    setFeito(r.quantidade);
    router.refresh();
  }

  const titulo = profissional ? "Ocultar paciente" : "Excluir atendimentos";
  const rotuloDoBotao = profissional
    ? meus > 0
      ? `Excluir ${plural(meus, "atendimento", "atendimentos")} e ocultar`
      : "Ocultar paciente"
    : `Excluir ${plural(total, "atendimento", "atendimentos")}`;
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
                  ? `${feito > 0 ? `${plural(feito, "atendimento excluído", "atendimentos excluídos")}. ` : ""}${nome} saiu da sua lista.`
                  : `${plural(feito, "atendimento excluído", "atendimentos excluídos")}.`}
              </p>
            ) : erroCarga ? (
              <p className="text-danger">{erroCarga}</p>
            ) : !futuros ? (
              <p className="text-muted">Carregando…</p>
            ) : !profissional && futuros.length === 0 ? (
              <p className="text-muted">Nenhum atendimento de agora em diante.</p>
            ) : (
              <>
                {profissional ? (
                  <>
                    <p>
                      {meus > 0
                        ? `${seus(meus)} com ${nome} de agora em diante ${meus === 1 ? "será excluído" : "serão excluídos"}, e o paciente sai da sua lista.`
                        : `Você não tem atendimentos com ${nome} de agora em diante. O paciente sai da sua lista.`}
                    </p>
                    <p className="text-xs text-muted">
                      Ele volta a aparecer para você quando alguém marcar um atendimento entre vocês, ou quando você marcar. A recepção e a direção recebem um aviso. Para inativar o paciente, fale com a recepção.
                    </p>
                  </>
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
            {feito === null && futuros && (profissional || futuros.length > 0) && (
              <button type="submit" disabled={trabalhando || (!profissional && total === 0) || !motivo.trim()} className="rounded-full bg-danger px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
                {trabalhando ? "Salvando…" : rotuloDoBotao}
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}
