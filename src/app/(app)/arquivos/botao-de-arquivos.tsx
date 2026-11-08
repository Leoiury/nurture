"use client";

// Cabeçalho do atendimento e da anamnese: um clipe com a quantidade, que abre os arquivos num painel.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Origem } from "./actions";
import type { ArquivoDoPaciente } from "./dados";
import { ListaDeArquivos } from "./lista-de-arquivos";

type Props = {
  paciente: { id: string; nome: string };
  /** O que for enviado por aqui fica ligado a este atendimento ou anamnese. */
  origem: Origem;
  arquivos: ArquivoDoPaciente[];
};

export function BotaoDeArquivos({ paciente, origem, arquivos }: Props) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Arquivos do paciente"
        aria-label={`Arquivos do paciente: ${arquivos.length}`}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm text-muted hover:bg-black/[0.05] hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="m13.5 7.4-5.6 5.6a3.3 3.3 0 0 1-4.7-4.7l5.8-5.8a2.2 2.2 0 0 1 3.1 3.1l-5.7 5.7a1.1 1.1 0 0 1-1.6-1.5l5.2-5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {arquivos.length > 0 && <span className="tabular-nums">{arquivos.length}</span>}
      </button>
      {/* Fora do cabeçalho: o desfoque dele prenderia o painel fixo à altura do próprio cabeçalho. */}
      {aberto && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setAberto(false)} aria-hidden />
          <aside role="dialog" aria-modal="true" aria-label="Arquivos do paciente" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Arquivos</h2>
                <p className="truncate text-sm text-muted">{paciente.nome}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ListaDeArquivos pacienteId={paciente.id} origem={origem} arquivos={arquivos} />
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
