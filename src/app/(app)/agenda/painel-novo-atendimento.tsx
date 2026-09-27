"use client";

// Painel (sheet) para lançar um novo atendimento. O formulário será definido na
// próxima etapa; por ora só a estrutura, aberta pelo botão "+" da agenda.

import { useEffect } from "react";

export function PainelNovoAtendimento({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Novo atendimento"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <h2 className="text-lg font-semibold">Novo atendimento</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="p-5 text-sm text-muted">O formulário de novo atendimento está em construção.</p>
      </aside>
    </>
  );
}
