"use client";

// Leitura dos registros de um atendimento: o de cada profissional, e cada versão.

import Link from "next/link";
import { useState } from "react";
import type { ConteudoDoRegistro } from "@/lib/atendimento/conteudo";
import type { DadosDoDocumento } from "@/lib/atendimento/exportar";
import { FUSO, partesNoFuso } from "@/lib/agenda/tempo";
import { LARGURA_COM_FOLHA, TextoDoRegistro } from "../editor-de-texto";
import { AcoesDeExportacao } from "../exportacao";

export type RegistroParaLer = {
  profissionalId: string;
  profissional: string;
  versaoAtual: number;
  versoes: { versao: number; conteudo: ConteudoDoRegistro; salvaEm: string }[];
};

export type CabecalhoDoAtendimento = { paciente: { id: string; nome: string }; inicio: string; fim: string };

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const dataHoraCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const horarioDoCabecalho = (c: CabecalhoDoAtendimento) => `${dataHora.format(new Date(c.inicio))} – ${hora.format(new Date(c.fim))}`;

export const dadosDoDocumento = (c: CabecalhoDoAtendimento, profissional: string): DadosDoDocumento => ({
  paciente: c.paciente.nome,
  quando: horarioDoCabecalho(c),
  data: partesNoFuso(c.inicio).data,
  profissional,
});

type Props = {
  id: string;
  cabecalho: CabecalhoDoAtendimento;
  registros: RegistroParaLer[];
  profissionalInicial: string | null;
  versaoInicial: number | null;
  podeEditar: boolean;
  meuProfissional: string | null;
  acabouDeFinalizar: boolean;
};

export function LeituraDosRegistros({ id, cabecalho, registros, profissionalInicial, versaoInicial, podeEditar, meuProfissional, acabouDeFinalizar }: Props) {
  const [profissionalId, setProfissionalId] = useState(registros.some((r) => r.profissionalId === profissionalInicial) ? profissionalInicial : (registros[0]?.profissionalId ?? null));
  const [versao, setVersao] = useState<number | null>(versaoInicial);
  const [avisoAberto, setAvisoAberto] = useState(acabouDeFinalizar);
  const registro = registros.find((r) => r.profissionalId === profissionalId);
  const exibida = registro?.versoes.find((v) => v.versao === versao) ?? registro?.versoes[0];

  return (
    <>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0 flex-1">
          <Link href={`/pacientes/${cabecalho.paciente.id}`} className="block truncate text-lg font-semibold tracking-tight hover:text-accent">
            {cabecalho.paciente.nome}
          </Link>
          <p className="text-sm text-muted first-letter:uppercase">{horarioDoCabecalho(cabecalho)}</p>
        </div>
        {podeEditar && (
          <Link href={`/atendimento/${id}?editar=1`} className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition hover:brightness-110">
            {registro?.profissionalId === meuProfissional ? "Editar" : "Escrever o meu registro"}
          </Link>
        )}
      </header>

      {avisoAberto && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" aria-hidden />
          <div role="alertdialog" aria-modal="true" aria-label="Atendimento finalizado" className="fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-3xl bg-surface p-5 text-sm shadow-2xl">
            <p className="text-base font-semibold">Atendimento finalizado</p>
            <p className="text-muted">O registro foi salvo no histórico, e o status mudou para atendido.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAvisoAberto(false)} className="rounded-full bg-black/[0.04] px-4 py-2 font-medium hover:bg-black/[0.07]">
                Ver o registro
              </button>
              <Link href={`/agenda?paciente=${cabecalho.paciente.id}`} className="rounded-full bg-accent px-4 py-2 font-medium text-white hover:brightness-110">
                Verificar próximos atendimentos
              </Link>
            </div>
          </div>
        </>
      )}

      <div className={`mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-6 ${exibida?.conteudo.modelo === "relatorio" ? LARGURA_COM_FOLHA : "max-w-3xl"}`}>
        {registros.length === 0 && <p className="rounded-3xl bg-surface p-5 text-sm text-muted shadow-sm ring-1 ring-black/5">Nenhum registro salvo neste atendimento.</p>}

        {registros.length > 1 && (
          <div role="tablist" aria-label="Profissional" className="flex flex-wrap gap-1 self-start rounded-full bg-black/[0.04] p-1">
            {registros.map((r) => (
              <button
                key={r.profissionalId}
                type="button"
                role="tab"
                aria-selected={r.profissionalId === profissionalId}
                onClick={() => {
                  setProfissionalId(r.profissionalId);
                  setVersao(null);
                }}
                className={`rounded-full px-3 py-1.5 text-sm ${r.profissionalId === profissionalId ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {r.profissional}
              </button>
            ))}
          </div>
        )}

        {registro && exibida && (
          // A chave recria os textos ao trocar de versão ou de profissional.
          <div key={`${registro.profissionalId}${exibida.versao}`} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {registros.length === 1 ? <p className="text-sm text-muted">Registro de {registro.profissional}</p> : <span />}
              <AcoesDeExportacao dados={dadosDoDocumento(cabecalho, registro.profissional)} obterConteudo={() => exibida.conteudo} />
            </div>
            {exibida.versao !== registro.versaoAtual && (
              <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                Versão {exibida.versao} de {registro.versaoAtual}.
              </p>
            )}
            {exibida.conteudo.modelo === "relatorio" ? (
              <section aria-label="Relatório">
                <TextoDoRegistro folha valor={exibida.conteudo.relatorio} rotulo="Texto do relatório" />
              </section>
            ) : (
              exibida.conteudo.topicos.map((t) => <Bloco key={t.perguntaId} titulo={t.pergunta} conteudo={t.resposta} />)
            )}
            <Bloco titulo="Observações" conteudo={exibida.conteudo.observacoes} />

            <section aria-label="Histórico de versões" className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="font-semibold">Histórico de versões</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {registro.versoes.map((v) => (
                  <li key={v.versao}>
                    <button
                      type="button"
                      aria-current={v.versao === exibida.versao ? "true" : undefined}
                      onClick={() => setVersao(v.versao)}
                      className={`flex w-full justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-background ${v.versao === exibida.versao ? "bg-accent-soft font-medium text-accent" : ""}`}
                    >
                      <span>
                        Versão {v.versao}
                        {v.versao === registro.versaoAtual ? " (atual)" : ""}
                      </span>
                      <span className="tabular-nums">{dataHoraCurta.format(new Date(v.salvaEm))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function Bloco({ titulo, conteudo }: { titulo: string; conteudo: ConteudoDoRegistro["relatorio"] }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold">{titulo}</h2>
      {conteudo ? <TextoDoRegistro valor={conteudo} rotulo={titulo} /> : <p className="text-sm text-muted">Sem texto.</p>}
    </section>
  );
}
