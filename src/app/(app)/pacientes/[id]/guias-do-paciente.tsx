"use client";

// Guias do paciente na ficha: o saldo de cada controle (plano + profissionais) e, para a
// recepção e o ADM, gerar uma guia nova, renovar e editar.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { hoje } from "@/lib/agenda/tempo";
import type { ControleDeGuia } from "../../agenda/actions-guias";
import { FormNovaGuia, ResumoDaGuia, botaoSecundario } from "../../agenda/guia-formularios";

type Props = { pacienteId: string; guias: ControleDeGuia[]; podeEditar: boolean; planoPadrao: string | null };

export function GuiasDoPaciente({ pacienteId, guias, podeEditar, planoPadrao }: Props) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function concluido(texto: string) {
    setGerando(false);
    setAviso(texto);
    router.refresh();
  }

  return (
    <section id="guias" aria-label="Guias" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Guias</h2>
        {podeEditar && !gerando && (
          <button type="button" onClick={() => setGerando(true)} className={botaoSecundario}>
            Gerar guia
          </button>
        )}
      </div>
      {guias.length === 0 && !gerando && <p className="text-sm text-muted">Nenhuma guia.</p>}
      {guias.map((c) => (
        <ResumoDaGuia key={c.id} controle={c} podeEditar={podeEditar} aoAlterar={concluido} />
      ))}
      {gerando && (
        <FormNovaGuia pacienteId={pacienteId} inicial={{ planoId: planoPadrao, profissionais: [], marcoZero: hoje() }} aoCancelar={() => setGerando(false)} aoConcluir={concluido} />
      )}
      {aviso && (
        <p role="status" className="text-sm text-accent">
          {aviso}
        </p>
      )}
    </section>
  );
}
