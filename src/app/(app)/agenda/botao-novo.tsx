"use client";

// O "+" de quem atende: agendar, realizar um atendimento ou uma anamnese. Antes de abrir
// um novo, pergunta se é o do paciente marcado para agora.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FUSO } from "@/lib/agenda/tempo";
import { ITEM_DO_MENU, MenuSuspenso } from "../atendimento/menu-suspenso";
import { marcadosAgora, type MarcadoAgora } from "./actions-novo-atendimento";

const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

type Pergunta = { marcados: MarcadoAgora[]; aoRecusar: () => void };

type Props = {
  estilo: string;
  icone: ReactNode;
  aoAgendar: () => void;
  /** Abre o formulário do avulso, que entra no calendário. */
  aoRealizarAvulso: (qual: "atendimento" | "anamnese") => void;
};

export function BotaoNovo({ estilo, icone, aoAgendar, aoRealizarAvulso }: Props) {
  const router = useRouter();
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);

  async function realizar(soAnamnese: boolean, aoRecusar: () => void) {
    // Sem resposta do servidor, segue sem perguntar: a pessoa está em atendimento.
    const todos = await marcadosAgora().catch(() => []);
    const marcados = soAnamnese ? todos.filter((m) => m.anamnese) : todos;
    if (marcados.length === 0) return aoRecusar();
    setPergunta({ marcados, aoRecusar });
  }

  return (
    <>
      <div className="fixed right-5 bottom-5 z-30">
        <MenuSuspenso rotulo="Novo atendimento" estilo={estilo} conteudoDoBotao={icone} paraCima>
          <button type="button" role="menuitem" onClick={aoAgendar} className={ITEM_DO_MENU}>
            Agendar um atendimento
          </button>
          <button type="button" role="menuitem" onClick={() => void realizar(false, () => aoRealizarAvulso("atendimento"))} className={ITEM_DO_MENU}>
            Realizar um atendimento
          </button>
          <button type="button" role="menuitem" onClick={() => void realizar(true, () => aoRealizarAvulso("anamnese"))} className={ITEM_DO_MENU}>
            Realizar uma anamnese
          </button>
        </MenuSuspenso>
      </div>

      {pergunta && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setPergunta(null)} aria-hidden />
          <div role="alertdialog" aria-modal="true" aria-label="Paciente marcado agora" className="fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-3xl bg-surface p-5 text-sm shadow-2xl">
            <p className="text-base font-semibold">{pergunta.marcados.length === 1 ? "Há um paciente marcado neste horário" : `Há ${pergunta.marcados.length} pacientes marcados neste horário`}</p>
            <p className="text-muted">{pergunta.marcados.length === 1 ? "O que você vai abrir é o atendimento dele?" : "O que você vai abrir é o atendimento de um deles?"}</p>
            <div className="flex flex-col gap-2">
              {pergunta.marcados.map((m) => (
                <button key={m.id} type="button" onClick={() => router.push(`/atendimento/${m.id}`)} className="rounded-2xl bg-accent px-4 py-2.5 text-left font-medium text-white hover:brightness-110">
                  Sim, abrir {m.paciente} ({hora.format(new Date(m.inicio))} – {hora.format(new Date(m.fim))}{m.anamnese ? `, ${m.tipo?.toLowerCase()}` : ""})
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  pergunta.aoRecusar();
                  setPergunta(null);
                }}
                className="rounded-2xl bg-black/[0.04] px-4 py-2.5 text-left font-medium hover:bg-black/[0.07]"
              >
                Não, é outro paciente
              </button>
            </div>
            <button type="button" onClick={() => setPergunta(null)} className="self-end rounded-full px-3 py-1.5 text-muted hover:bg-background">
              Cancelar
            </button>
          </div>
        </>
      )}
    </>
  );
}
