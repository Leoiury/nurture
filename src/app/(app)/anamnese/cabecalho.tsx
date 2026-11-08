"use client";

// Cabeçalho fixo das telas de anamnese: o paciente à esquerda; à direita, editar o
// modelo de perguntas, os arquivos e marcar consulta.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PainelNovoAtendimento } from "../agenda/painel-novo-atendimento";

type Props = {
  children: ReactNode;
  /** Paciente já escolhido, para marcar a consulta dele. */
  pacienteId?: string;
  /** Para onde voltar depois de editar o modelo. */
  voltarDoModelo: string;
  /** Sem profissional vinculado, não há modelo próprio. */
  comModelo: boolean;
  /** Botão dos arquivos do paciente, nas telas de uma anamnese. */
  arquivos?: ReactNode;
};

export function CabecalhoDaAnamnese({ children, pacienteId, voltarDoModelo, comModelo, arquivos }: Props) {
  const [marcando, setMarcando] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1">{children}</div>
      {arquivos}
      {comModelo && (
        <Link href={`/anamnese/editar?voltar=${encodeURIComponent(voltarDoModelo)}`} className="shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Editar anamnese
        </Link>
      )}
      <button type="button" onClick={() => setMarcando(true)} className="shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
        Marcar consulta
      </button>
      {marcando && <PainelNovoAtendimento inicial={{ pacienteId }} aoFechar={() => setMarcando(false)} />}
    </header>
  );
}
