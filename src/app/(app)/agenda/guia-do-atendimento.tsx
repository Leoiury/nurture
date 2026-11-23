"use client";

// Seção "Guia" do painel do atendimento: a sessão que ele gasta, o saldo do controle
// (guias do paciente com este profissional e plano) e, para a recepção e o ADM, gerar,
// renovar e editar.

import { useEffect, useState } from "react";
import { situacaoDaGuia } from "@/lib/agenda/guias";
import { partesNoFuso } from "@/lib/agenda/tempo";
import { guiaDoAtendimento, type GuiaDoAtendimento } from "./actions-guias";
import { FormNovaGuia, ResumoDaGuia, botaoSecundario } from "./guia-formularios";
import { IconeGuia } from "./icone-guia";

type Props = {
  atendimentoId: string;
  status: string;
  /** Muda quando o painel recarrega (ex.: status alterado). */
  versao: number;
  /** Depois de gerar, renovar, editar ou excluir. */
  aoAlterar: (aviso: string) => void;
};

export function GuiaDoAtendimento({ atendimentoId, status, versao, aoAlterar }: Props) {
  const [guia, setGuia] = useState<GuiaDoAtendimento | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let ativo = true;
    guiaDoAtendimento(atendimentoId)
      .then((g) => ativo && setGuia(g))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [atendimentoId, versao, recarga]);

  if (!guia) return erro ? <p className="text-danger">{erro}</p> : null;

  function concluido(aviso: string) {
    setGerando(false);
    setRecarga((n) => n + 1);
    aoAlterar(aviso);
  }

  const situacao = situacaoDaGuia(guia.atual, guia.exigeGuia, status);
  const atual = guia.atual;
  const { sugestao } = guia;

  return (
    <section aria-label="Guia" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-semibold">
        Guia
        {situacao && <IconeGuia situacao={situacao} tamanho={16} />}
      </h3>

      {atual ? (
        <p>
          {atual.numero ? `Nº ${atual.numero}` : "Sem número"} · sessão {atual.sessao} de {atual.total}
          <span className="text-muted">
            {" · "}
            {atual.total - atual.sessao === 0 ? "última sessão" : atual.total - atual.sessao === 1 ? "falta 1 sessão" : `faltam ${atual.total - atual.sessao} sessões`}
          </span>
        </p>
      ) : status === "desmarcado" ? (
        <p className="text-muted">Desmarcado não gasta sessão.</p>
      ) : guia.controle ? (
        <p className={situacao === "falta" ? "text-danger" : "text-muted"}>
          {new Date(guia.sugestao.marcoZero) < new Date(guia.controle.marcoZero) ? "Antes do marco zero da guia." : "As sessões da guia já acabaram: renove."}
        </p>
      ) : (
        <p className={situacao === "falta" ? "text-danger" : "text-muted"}>{situacao === "falta" ? "O plano exige guia e este atendimento não tem." : "Sem guia."}</p>
      )}

      {guia.controle && <ResumoDaGuia controle={guia.controle} podeEditar={guia.podeEditar} aoAlterar={concluido} />}

      {!guia.controle && guia.podeEditar && sugestao.pacienteId && !gerando && (
        <button type="button" onClick={() => setGerando(true)} className={`${botaoSecundario} self-start`}>
          Gerar guia
        </button>
      )}
      {gerando && sugestao.pacienteId && (
        <FormNovaGuia
          pacienteId={sugestao.pacienteId}
          inicial={{ planoId: sugestao.planoId, profissionais: sugestao.profissionais, marcoZero: partesNoFuso(sugestao.marcoZero).data }}
          aoCancelar={() => setGerando(false)}
          aoConcluir={concluido}
        />
      )}
    </section>
  );
}
