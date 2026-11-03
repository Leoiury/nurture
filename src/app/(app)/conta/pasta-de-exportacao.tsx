"use client";

// Configuração da pasta onde os PDFs e documentos Word são salvos.

import { useEffect, useState } from "react";
import { escolherPasta, escolherPastaDisponivel, esquecerPasta, lerPasta } from "../atendimento/pasta-de-arquivos";

export function PastaDeExportacao() {
  // null: ainda não verificou (o servidor não sabe qual é o navegador).
  const [estado, setEstado] = useState<{ disponivel: boolean; pasta: string | null } | null>(null);

  useEffect(() => {
    let ativo = true;
    void lerPasta().then((pasta) => {
      if (ativo) setEstado({ disponivel: escolherPastaDisponivel(), pasta: pasta?.name ?? null });
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function escolher() {
    const nome = await escolherPasta();
    if (nome) setEstado({ disponivel: true, pasta: nome });
  }

  async function remover() {
    await esquecerPasta();
    setEstado({ disponivel: true, pasta: null });
  }

  return (
    <section aria-label="Pasta dos arquivos" className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold">Pasta dos arquivos</h2>
      {estado && !estado.disponivel && <p className="text-sm text-muted">Este navegador não permite escolher uma pasta. Os PDFs e documentos Word vão para os downloads. Para escolher, use o Chrome ou o Edge no computador.</p>}
      {estado?.disponivel && (
        <>
          <p className="text-sm text-muted">
            {estado.pasta ? (
              <>
                Os PDFs e documentos Word são salvos em <strong className="text-foreground">{estado.pasta}</strong>, neste navegador. Às vezes, o navegador pede para confirmar a permissão.
              </>
            ) : (
              "Os PDFs e documentos Word vão para os downloads. Escolha uma pasta para salvá-los sempre no mesmo lugar, neste navegador."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void escolher()} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
              {estado.pasta ? "Trocar a pasta" : "Escolher a pasta"}
            </button>
            {estado.pasta && (
              <button type="button" onClick={() => void remover()} className="rounded-full px-4 py-2 text-sm text-muted hover:bg-black/[0.04] hover:text-foreground">
                Usar os downloads
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
