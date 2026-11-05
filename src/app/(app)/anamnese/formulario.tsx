"use client";

// Preenchimento da anamnese: perguntas, respostas e observações. O texto é guardado
// sozinho enquanto se digita; "Salvar" o grava no histórico do paciente.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ItemDaAnamnese } from "@/lib/anamnese/conteudo";
import { useGuardarSozinho } from "../guardar-sozinho";
import { descartarEdicao, guardarRascunho, salvarAnamnese } from "./actions";
import { CabecalhoDaAnamnese } from "./cabecalho";

type Texto = { itens: ItemDaAnamnese[]; observacoes: string };

type Props = {
  id: string;
  paciente: { id: string; nome: string };
  /** "Anamnese", ou o tipo do atendimento (ex.: Triagem). */
  titulo: string;
  itensIniciais: ItemDaAnamnese[];
  observacoesIniciais: string;
  /** Já salva: esta edição gera uma nova versão. */
  versao: number;
};

export function FormularioDaAnamnese({ id, titulo, paciente, itensIniciais, observacoesIniciais, versao }: Props) {
  const router = useRouter();
  const [itens, setItens] = useState(itensIniciais);
  const [observacoes, setObservacoes] = useState(observacoesIniciais);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = useCallback((t: Texto) => guardarRascunho(id, t.itens, t.observacoes), [id]);
  const { situacao, mudou: guardar, guardarAgora, parar, retomar, atual } = useGuardarSozinho<Texto>({ itens: itensIniciais, observacoes: observacoesIniciais }, gravar);

  function mudou(novosItens: ItemDaAnamnese[], novasObservacoes: string) {
    setItens(novosItens);
    setObservacoes(novasObservacoes);
    guardar({ itens: novosItens, observacoes: novasObservacoes });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    await parar();
    const r = await salvarAnamnese(id, atual.current.itens, atual.current.observacoes).catch(() => ({ ok: false as const, erro: "Falha de conexão ao salvar." }));
    if (!r.ok) {
      retomar();
      setSalvando(false);
      return setErro(r.erro);
    }
    router.push(`/anamnese/${id}`);
    router.refresh();
  }

  async function descartar() {
    await parar();
    await descartarEdicao(id).catch(() => null);
    router.push(`/anamnese/${id}`);
    router.refresh();
  }

  return (
    <>
      <CabecalhoDaAnamnese pacienteId={paciente.id} voltarDoModelo={`/anamnese/${id}`} comModelo={versao === 0}>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{versao > 0 ? `Editando a versão ${versao}` : titulo}</p>
        <Link href={`/pacientes/${paciente.id}`} className="block truncate text-lg font-semibold tracking-tight hover:text-accent">
          {paciente.nome}
        </Link>
      </CabecalhoDaAnamnese>

      <form
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 pb-28 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {itens.length === 0 && (
          <p className="rounded-3xl bg-surface p-5 text-sm text-muted shadow-sm ring-1 ring-black/5">
            Sua anamnese ainda não tem perguntas. Use “Editar anamnese” para criá-las, ou escreva nas observações.
          </p>
        )}
        {itens.map((item, i) => (
          <section key={item.perguntaId} className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
            <label htmlFor={`resposta-${item.perguntaId}`} className="font-semibold">
              {item.pergunta}
            </label>
            <textarea
              id={`resposta-${item.perguntaId}`}
              value={item.resposta}
              rows={4}
              onChange={(e) => mudou(itens.map((x, k) => (k === i ? { ...x, resposta: e.target.value } : x)), observacoes)}
              onBlur={() => void guardarAgora()}
              className={campo}
            />
          </section>
        ))}
        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <label htmlFor="observacoes" className="font-semibold">
            Observações
          </label>
          <textarea id="observacoes" value={observacoes} rows={5} onChange={(e) => mudou(itens, e.target.value)} onBlur={() => void guardarAgora()} className={campo} />
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
          <p role="status" className="mr-auto text-xs text-muted">
            {situacao === "guardando" ? "Guardando…" : situacao === "erro" ? "Não foi possível guardar. Vamos tentar de novo." : "Texto guardado"}
          </p>
          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}
          {versao > 0 && (
            <button type="button" onClick={() => void descartar()} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
              Descartar alterações
            </button>
          )}
          <button type="submit" disabled={salvando} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50">
            {salvando ? "Salvando…" : versao > 0 ? "Salvar nova versão" : "Salvar no histórico"}
          </button>
        </div>
      </form>
    </>
  );
}

const campo = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
