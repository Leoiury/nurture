"use client";

import { useState } from "react";
import { PainelDoProfissional, type ProfissionalEditavel } from "../painel-do-profissional";

export function CabecalhoDoProfissional({ profissional: p, futuros, podeEditar }: { profissional: ProfissionalEditavel; futuros: number; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.nome}
            {!p.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 align-middle text-xs font-normal text-muted">inativo</span>}
          </h1>
          {p.especialidade && <p className="text-sm text-muted">{p.especialidade}</p>}
        </div>
        {podeEditar && (
          <button type="button" onClick={() => setEditando(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
          Editar
        </button>
        )}
      </header>
      {editando && <PainelDoProfissional profissional={p} futuros={futuros} aoFechar={() => setEditando(false)} />}
    </>
  );
}
