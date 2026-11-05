"use client";

// Cores do calendário do profissional, por status do atendimento. Salva a cada escolha.

import { useState } from "react";
import { CORES_STATUS_PADRAO, PALETA_PLANOS, ROTULOS_DOS_STATUS } from "@/lib/agenda/cores";
import type { Status } from "@/lib/agenda/dados";
import { salvarCoresDoCalendario } from "./actions";

export function CoresDoCalendario({ iniciais }: { iniciais: Record<Status, string> }) {
  const [cores, setCores] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(novas: Record<Status, string>) {
    const anteriores = cores;
    setCores(novas);
    setErro(null);
    const r = await salvarCoresDoCalendario(novas).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) {
      setCores(anteriores);
      setErro(r.erro);
    }
  }

  return (
    <section aria-label="Cores do calendário" className="flex flex-col gap-4 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Cores do calendário</h2>
          <p className="text-sm text-muted">A cor de cada atendimento segue o status dele. Só você vê estas cores.</p>
        </div>
        <button type="button" onClick={() => void salvar(CORES_STATUS_PADRAO)} className="shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Restaurar
        </button>
      </div>
      {ROTULOS_DOS_STATUS.map(([status, rotulo]) => (
        <div key={status} className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{rotulo}</p>
          <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
            {PALETA_PLANOS.map((c) => (
              <button
                key={c.hex}
                type="button"
                role="radio"
                aria-checked={cores[status] === c.hex}
                aria-label={c.nome}
                title={c.nome}
                onClick={() => cores[status] !== c.hex && void salvar({ ...cores, [status]: c.hex })}
                className={`size-8 rounded-full ring-1 ring-black/10 transition ${cores[status] === c.hex ? "outline-2 outline-offset-2 outline-[var(--accent)]" : "hover:scale-110"}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
      ))}
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
