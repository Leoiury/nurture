"use client";

import Link from "next/link";
import { useState } from "react";
import { PainelDoProfissional, type ProfissionalEditavel } from "./painel-do-profissional";

export type ProfissionalDaLista = ProfissionalEditavel;

export function ListaDeProfissionais({ profissionais }: { profissionais: ProfissionalDaLista[] }) {
  const [criando, setCriando] = useState(false);
  const [inativos, setInativos] = useState(false);
  const totalInativos = profissionais.filter((p) => !p.ativo).length;
  const visiveis = profissionais.filter((p) => inativos || p.ativo);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
        <button type="button" onClick={() => setCriando(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
          Novo profissional
        </button>
      </header>

      {totalInativos > 0 && (
        <label className="flex cursor-pointer items-center gap-2 self-start text-sm text-muted">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Mostrar inativos ({totalInativos})
        </label>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5" aria-label="Profissionais">
        {visiveis.map((p) => (
          <li key={p.id}>
            <Link href={`/profissionais/${p.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-background">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent" aria-hidden>
                {p.nome.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${p.ativo ? "" : "text-muted"}`}>
                  {p.nome}
                  {!p.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal">inativo</span>}
                </span>
                <span className="block truncate text-xs text-muted">{[p.especialidade, p.registro].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="hidden shrink-0 text-right text-xs text-muted sm:block">
                {p.celular}
                {p.celular && p.email && <br />}
                {p.email}
              </span>
            </Link>
          </li>
        ))}
        {visiveis.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nenhum profissional cadastrado.</li>}
      </ul>

      {criando && <PainelDoProfissional profissional={null} aoFechar={() => setCriando(false)} />}
    </>
  );
}
