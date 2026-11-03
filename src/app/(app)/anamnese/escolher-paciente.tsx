"use client";

// Início de uma anamnese: escolher ou cadastrar o paciente. Ao escolher, abre a
// anamnese dele (a que estiver em andamento, ou uma nova).

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { paraBusca } from "@/lib/pacientes";
import type { OpcoesDoFormulario } from "../agenda/actions-novo-atendimento";
import { CadastroRapido } from "../agenda/painel-novo-atendimento";
import { abrirAnamnese, abrirAnamneseDoAtendimento } from "./actions";
import { CabecalhoDaAnamnese } from "./cabecalho";

type Props = {
  pacientes: OpcoesDoFormulario["pacientes"];
  planos: OpcoesDoFormulario["planos"];
  /** Vindo da página do paciente: abre direto. */
  pacienteInicial: string | null;
  /** Vindo de um atendimento do tipo Anamnese: abre a anamnese dele. */
  atendimentoInicial: string | null;
  comModelo: boolean;
};

export function EscolherPaciente({ pacientes, planos, pacienteInicial, atendimentoInicial, comModelo }: Props) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  // Vindo de um paciente ou de um atendimento, já começa abrindo.
  const [abrindo, setAbrindo] = useState(!!pacienteInicial || !!atendimentoInicial);
  const [erro, setErro] = useState<string | null>(null);

  const sugestoes = useMemo(() => {
    const termo = paraBusca(busca);
    if (termo.length < 2) return [];
    return pacientes.filter((p) => paraBusca(p.nome).includes(termo)).slice(0, 8);
  }, [pacientes, busca]);

  async function abrir(id: string) {
    setAbrindo(true);
    setErro(null);
    await irPara(id);
  }

  async function irPara(id: string, doAtendimento = false) {
    const r = await (doAtendimento ? abrirAnamneseDoAtendimento(id) : abrirAnamnese(id)).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) {
      setAbrindo(false);
      return setErro(r.erro);
    }
    router.replace(`/anamnese/${r.id}`);
  }

  const abriuInicial = useRef(false);
  useEffect(() => {
    if ((!pacienteInicial && !atendimentoInicial) || abriuInicial.current) return;
    abriuInicial.current = true;
    void (atendimentoInicial ? irPara(atendimentoInicial, true) : irPara(pacienteInicial!));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir a página
  }, [pacienteInicial, atendimentoInicial]);

  return (
    <>
      <CabecalhoDaAnamnese voltarDoModelo="/anamnese" comModelo={comModelo}>
        <h1 className="text-lg font-semibold tracking-tight">Nova anamnese</h1>
      </CabecalhoDaAnamnese>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        {!comModelo && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">Este login não tem um profissional vinculado, então não pode preencher anamneses.</p>}
        <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <label htmlFor="busca-paciente" className="text-xs font-semibold tracking-wide text-muted uppercase">
            Paciente
          </label>
          <div className="flex gap-2">
            <input
              id="busca-paciente"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pelo nome…"
              autoComplete="off"
              autoFocus
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
            <button type="button" onClick={() => setCadastrando(true)} className="shrink-0 rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
              + Novo
            </button>
          </div>
          {sugestoes.length > 0 && (
            <ul aria-label="Pacientes encontrados" className="flex flex-col gap-1">
              {sugestoes.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={abrindo} onClick={() => void abrir(p.id)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-background disabled:opacity-50">
                    {p.nome}
                    {p.responsavel && <span className="block text-xs text-muted">Resp.: {p.responsavel}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busca.trim().length >= 2 && sugestoes.length === 0 && <p className="text-xs text-muted">Nenhum paciente com esse nome. Use “+ Novo” para cadastrar.</p>}
          {cadastrando && <CadastroRapido nomeInicial={busca} planos={planos} aoCancelar={() => setCadastrando(false)} aoCriar={(novo) => void abrir(novo.id)} />}
          {abrindo && <p role="status" className="text-sm text-muted">Abrindo a anamnese…</p>}
          {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
        </section>
      </div>
    </>
  );
}
