"use client";

// Tela de atendimento: cabeçalho fixo com os dados e as funções, os tópicos ou o
// relatório (uma folha em branco), e as observações. O texto é guardado sozinho; finalizar grava uma versão
// e marca o atendimento como atendido.

import type { Editor } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { SituacaoDaGuia } from "@/lib/agenda/guias";
import type { Status } from "@/lib/agenda/dados";
import type { ConteudoDoRegistro, Documento, ModeloDoRegistro } from "@/lib/atendimento/conteudo";
import { useGuardarSozinho } from "../../guardar-sozinho";
import type { DetalhesAtendimento } from "../../agenda/actions";
import { BotaoDeArquivos } from "../../arquivos/botao-de-arquivos";
import type { ArquivoDoPaciente } from "../../arquivos/dados";
import { IconeGuia } from "../../agenda/icone-guia";
import { dadosDeEdicao } from "../../agenda/painel-atendimento";
import { PainelNovoAtendimento } from "../../agenda/painel-novo-atendimento";
import { definirModeloPreferido, guardarRegistro, salvarRegistro } from "../actions";
import { BarraDeFormatacao, EditorDeTexto, LARGURA_COM_FOLHA } from "../editor-de-texto";
import { AcoesDeExportacao } from "../exportacao";
import { ITEM_DO_MENU, MenuSuspenso } from "../menu-suspenso";
import { dadosDoDocumento, horarioDoCabecalho, type CabecalhoDoAtendimento } from "./leitura";

const ROTULO_GUIA: Record<SituacaoDaGuia, string> = { ok: "em dia", vencendo: "perto do fim", falta: "falta guia" };

type Props = {
  id: string;
  cabecalho: CabecalhoDoAtendimento;
  arquivos: ArquivoDoPaciente[];
  guia: SituacaoDaGuia | null;
  sessaoDaGuia: { posicao: number; quantidade: number } | null;
  detalhes: DetalhesAtendimento;
  conteudoInicial: ConteudoDoRegistro;
  /** Já salvo: esta edição gera uma nova versão. */
  versao: number;
  statusAtual: Status;
  /** Nome de quem está escrevendo, para os documentos exportados. */
  profissional: string;
};

export function TelaDoAtendimento({ id, cabecalho, arquivos, guia, sessaoDaGuia, detalhes, conteudoInicial, versao, statusAtual, profissional }: Props) {
  const router = useRouter();
  const [modelo, setModelo] = useState<ModeloDoRegistro>(conteudoInicial.modelo);
  const [editorAtivo, setEditorAtivo] = useState<Editor | null>(null);
  const [editandoDados, setEditandoDados] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = useCallback((c: ConteudoDoRegistro) => guardarRegistro(id, c), [id]);
  const { situacao, mudou, guardarAgora, parar, retomar, atual } = useGuardarSozinho<ConteudoDoRegistro>(conteudoInicial, gravar);

  const mudar = (parte: Partial<ConteudoDoRegistro>) => mudou({ ...atual.current, ...parte });
  const mudarTopico = (perguntaId: string, resposta: Documento) =>
    mudar({ topicos: atual.current.topicos.map((t) => (t.perguntaId === perguntaId ? { ...t, resposta } : t)) });

  function trocarModelo(novo: ModeloDoRegistro) {
    if (novo === modelo) return;
    setModelo(novo);
    setEditorAtivo(null); // o campo em que se escrevia pode ter saído da tela
    mudar({ modelo: novo });
    void definirModeloPreferido(novo).catch(() => null);
  }

  const voltarDepois = versao > 0 ? `/atendimento/${id}?editar=1` : `/atendimento/${id}`;
  const urlDoModelo = `/atendimento/modelo?voltar=${encodeURIComponent(voltarDepois)}`;
  const urlDosProximos = `/agenda?paciente=${cabecalho.paciente.id}`;
  // Já finalizado antes: salvar só cria uma versão, sem mexer no status.
  const soNovaVersao = versao > 0;

  async function concluir() {
    setSalvando(true);
    setErro(null);
    await parar();
    const r = await salvarRegistro(id, atual.current, !soNovaVersao).catch(() => ({ ok: false as const, erro: "Falha de conexão ao salvar." }));
    setSalvando(false);
    if (!r.ok) {
      retomar();
      return setErro(r.erro);
    }
    // O aviso de finalizado fica na URL: salvar recarrega a página, que passa a ser a de leitura.
    router.push(soNovaVersao ? `/atendimento/${id}` : `/atendimento/${id}?finalizado=1`);
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              <Link href={`/pacientes/${cabecalho.paciente.id}`} title="Ver o histórico do paciente" className="hover:text-accent hover:underline">
                {cabecalho.paciente.nome}
              </Link>
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className="first-letter:uppercase">{horarioDoCabecalho(cabecalho)}</span>
              {guia && (
                <span className="inline-flex items-center gap-1" aria-label="Guia">
                  · <IconeGuia situacao={guia} tamanho={14} /> Guia {ROTULO_GUIA[guia]}
                  {sessaoDaGuia && ` (sessão ${sessaoDaGuia.posicao} de ${sessaoDaGuia.quantidade})`}
                </span>
              )}
              {versao > 0 && <span>· editando a versão {versao}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Modelo do registro" className="flex gap-1 rounded-full bg-black/[0.04] p-1">
              {MODELOS.map(({ valor, rotulo }) => (
                <button key={valor} type="button" role="tab" aria-selected={modelo === valor} onClick={() => trocarModelo(valor)} className={`rounded-full px-3 py-1 text-sm ${modelo === valor ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}>
                  {rotulo}
                </button>
              ))}
            </div>
            <BotaoDeArquivos paciente={cabecalho.paciente} atendimentoId={id} arquivos={arquivos} />
            <MenuSuspenso
              rotulo="Editar"
              estilo="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-black/[0.05] hover:text-foreground"
              conteudoDoBotao={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M10.8 2.6a1.6 1.6 0 0 1 2.3 2.3l-8 8-3.1.8.8-3.1 8-8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              }
            >
              <button type="button" role="menuitem" onClick={() => setEditandoDados(true)} className={ITEM_DO_MENU}>
                Editar atendimento
              </button>
              <Link href={urlDoModelo} role="menuitem" className={ITEM_DO_MENU}>
                Editar tópicos
              </Link>
            </MenuSuspenso>
            <AcoesDeExportacao dados={dadosDoDocumento(cabecalho, profissional)} obterConteudo={() => atual.current} />
          </div>
        </div>
        <BarraDeFormatacao editor={editorAtivo} />
      </header>

      <div className={`mx-auto flex w-full flex-col gap-4 px-4 py-6 pb-28 sm:px-6 ${modelo === "relatorio" ? LARGURA_COM_FOLHA : "max-w-3xl"}`}>
        {modelo === "relatorio" ? (
          <EditorDeTexto key="relatorio" folha rotulo="Relatório" valor={atual.current.relatorio} aoMudar={(relatorio) => mudar({ relatorio })} aoFocar={setEditorAtivo} aoSair={() => void guardarAgora()} />
        ) : (
          <>
            {conteudoInicial.topicos.length === 0 && (
              <p className="rounded-3xl bg-surface p-5 text-sm text-muted shadow-sm ring-1 ring-black/5">
                Você ainda não tem tópicos. Use o lápis, no alto, para criá-los, ou escolha “Relatório” para escrever um texto livre.
              </p>
            )}
            {conteudoInicial.topicos.map((t) => (
              <Campo key={t.perguntaId} titulo={t.pergunta}>
                <EditorDeTexto
                  rotulo={t.pergunta}
                  valor={atual.current.topicos.find((x) => x.perguntaId === t.perguntaId)?.resposta ?? null}
                  aoMudar={(doc) => mudarTopico(t.perguntaId, doc)}
                  aoFocar={setEditorAtivo}
                  aoSair={() => void guardarAgora()}
                />
              </Campo>
            ))}
          </>
        )}
        <Campo titulo="Observações">
          <EditorDeTexto rotulo="Observações" valor={atual.current.observacoes} aoMudar={(observacoes) => mudar({ observacoes })} aoFocar={setEditorAtivo} aoSair={() => void guardarAgora()} />
        </Campo>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p role="status" className="pointer-events-auto rounded-full bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-sm ring-1 ring-black/5 backdrop-blur">
          {situacao === "guardando" ? "Guardando…" : situacao === "erro" ? "Não foi possível guardar. Vamos tentar de novo." : "Texto guardado"}
        </p>
        {erro && (
          <p role="alert" className="pointer-events-auto rounded-full bg-surface px-3 py-1.5 text-sm text-danger shadow-sm">
            {erro}
          </p>
        )}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Link href={urlDosProximos} className="rounded-full bg-surface px-4 py-2.5 text-sm font-medium shadow-md ring-1 ring-black/5 hover:shadow-lg">
            Próximos atendimentos
          </Link>
          <button type="button" disabled={salvando} onClick={() => void concluir()} className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-black/20 transition hover:brightness-110 disabled:opacity-50">
            {salvando ? "Salvando…" : soNovaVersao ? "Salvar nova versão" : statusAtual === "atendido" ? "Salvar registro" : "Finalizar atendimento"}
          </button>
        </div>
      </div>

      {editandoDados && (
        <PainelNovoAtendimento
          edicao={dadosDeEdicao(detalhes)}
          aoFechar={() => {
            setEditandoDados(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

const MODELOS: { valor: ModeloDoRegistro; rotulo: string }[] = [
  { valor: "topicos", rotulo: "Tópicos" },
  { valor: "relatorio", rotulo: "Relatório" },
];

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
