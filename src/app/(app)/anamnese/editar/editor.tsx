"use client";

// Editor do modelo de anamnese do profissional: adicionar, editar, excluir e
// reordenar perguntas (segurando o ícone à esquerda e arrastando, ou com as setas).
// Cada mudança é gravada na hora; as anamneses já salvas não mudam.

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { adicionarPergunta, editarPergunta, excluirPergunta, reordenarPerguntas } from "../actions";

type Pergunta = { id: string; texto: string };

const moverItem = (lista: Pergunta[], de: number, para: number) => {
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
};

export function EditorDoModelo({ perguntasIniciais, voltar }: { perguntasIniciais: Pergunta[]; voltar: string }) {
  const [perguntas, setPerguntas] = useState(perguntasIniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [focar, setFocar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const linhas = useRef(new Map<string, HTMLLIElement>());
  // O texto já gravado de cada pergunta, para só gravar o que mudou.
  const gravados = useRef(new Map(perguntasIniciais.map((p) => [p.id, p.texto])));
  const atual = useRef(perguntas);
  useEffect(() => {
    atual.current = perguntas;
  }, [perguntas]);

  useEffect(() => {
    if (!focar) return;
    const campo = linhas.current.get(focar)?.querySelector("input");
    campo?.focus();
    campo?.select();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só uma vez, depois de a linha nova aparecer
    setFocar(null);
  }, [focar]);

  async function gravarOrdem() {
    const r = await reordenarPerguntas(atual.current.map((p) => p.id)).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setErro(r.ok ? null : r.erro);
  }

  async function adicionar() {
    setErro(null);
    const r = await adicionarPergunta("Nova pergunta").catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) return setErro(r.erro);
    gravados.current.set(r.id, "Nova pergunta");
    setPerguntas((lista) => [...lista, { id: r.id, texto: "Nova pergunta" }]);
    setFocar(r.id);
  }

  async function renomear(id: string, texto: string) {
    if (texto === gravados.current.get(id)) return;
    const r = await editarPergunta(id, texto).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (r.ok) gravados.current.set(id, texto);
    setErro(r.ok ? null : r.erro);
  }

  async function excluir(id: string) {
    setExcluindo(id);
    const r = await excluirPergunta(id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setExcluindo(null);
    if (!r.ok) return setErro(r.erro);
    setErro(null);
    setPerguntas((lista) => lista.filter((p) => p.id !== id));
  }

  function iniciarArraste(e: PointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastando(id);
  }

  // Sobre o meio de outra linha, a pergunta arrastada troca de lugar com ela.
  function acompanharArraste(e: PointerEvent<HTMLButtonElement>) {
    if (!arrastando) return;
    const lista = atual.current;
    const de = lista.findIndex((p) => p.id === arrastando);
    const para = lista.findIndex((p) => {
      const r = linhas.current.get(p.id)?.getBoundingClientRect();
      return !!r && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (para < 0 || para === de) return;
    const nova = moverItem(lista, de, para);
    atual.current = nova;
    setPerguntas(nova);
  }

  function terminarArraste() {
    if (!arrastando) return;
    setArrastando(null);
    void gravarOrdem();
  }

  function moverComTeclado(e: React.KeyboardEvent, i: number) {
    const para = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
    if (para < 0 || para >= perguntas.length) return;
    e.preventDefault();
    const nova = moverItem(perguntas, i, para);
    atual.current = nova;
    setPerguntas(nova);
    void gravarOrdem();
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0 flex-1">
          <Link href={voltar} className="text-sm text-muted hover:text-foreground">
            ← Voltar
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">Editar anamnese</h1>
        </div>
        <button type="button" onClick={() => void adicionar()} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110">
          + Adicionar pergunta
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted">As perguntas são só suas. As mudanças valem para as próximas anamneses; as já salvas continuam como foram feitas.</p>
        {erro && (
          <p role="alert" className="text-sm text-danger">
            {erro}
          </p>
        )}
        {perguntas.length === 0 && <p className="rounded-3xl bg-surface p-5 text-sm text-muted shadow-sm ring-1 ring-black/5">Nenhuma pergunta ainda.</p>}

        <ul aria-label="Perguntas" className="flex flex-col gap-3">
          {perguntas.map((p, i) => (
            <li
              key={p.id}
              ref={(el) => {
                if (el) linhas.current.set(p.id, el);
                else linhas.current.delete(p.id);
              }}
              className={`flex items-start gap-2 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-black/5 ${arrastando === p.id ? "opacity-70 shadow-lg ring-accent" : ""}`}
            >
              <button
                type="button"
                aria-label={`Reordenar: ${p.texto}`}
                title="Segure e arraste para reordenar"
                onPointerDown={(e) => iniciarArraste(e, p.id)}
                onPointerMove={acompanharArraste}
                onPointerUp={terminarArraste}
                onPointerCancel={terminarArraste}
                onKeyDown={(e) => moverComTeclado(e, i)}
                className="mt-1.5 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted hover:bg-background active:cursor-grabbing"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
                  {[3, 7, 11].flatMap((y) => [4.5, 9.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" />))}
                </svg>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  value={p.texto}
                  aria-label={`Pergunta ${i + 1}`}
                  onChange={(e) => setPerguntas((lista) => lista.map((x) => (x.id === p.id ? { ...x, texto: e.target.value } : x)))}
                  onBlur={(e) => void renomear(p.id, e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-semibold outline-none hover:border-border focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
                <div aria-hidden className="h-14 rounded-xl border border-dashed border-border" />
              </div>
              <button
                type="button"
                disabled={excluindo === p.id}
                aria-label={`Excluir: ${p.texto}`}
                title="Excluir pergunta"
                onClick={() => void excluir(p.id)}
                className="mt-1 shrink-0 rounded-full px-2 py-1 text-muted hover:bg-red-50 hover:text-danger disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <section aria-label="Observações" className="flex flex-col gap-2 rounded-3xl bg-black/[0.03] p-4 pl-11">
          <p className="font-semibold text-muted">Observações</p>
          <div aria-hidden className="h-14 rounded-xl border border-dashed border-border" />
          <p className="text-xs text-muted">Campo fixo, sempre no fim da anamnese.</p>
        </section>
      </div>
    </>
  );
}
