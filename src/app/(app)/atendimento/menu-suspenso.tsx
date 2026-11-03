"use client";

// Menu que abre a partir de um botão. Fecha ao escolher, ao clicar fora e com Esc.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export const ITEM_DO_MENU = "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-background focus:bg-background focus:outline-none disabled:opacity-50";

type Props = {
  rotulo: string;
  /** Classes do botão que abre o menu. */
  estilo: string;
  conteudoDoBotao: ReactNode;
  /** Para botões no pé da tela. */
  paraCima?: boolean;
  children: ReactNode;
};

export function MenuSuspenso({ rotulo, estilo, conteudoDoBotao, paraCima, children }: Props) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const itens = () => [...(lista.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];

  useEffect(() => {
    if (!aberto) return;
    itens()[0]?.focus();
    const aoClicarFora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", aoClicarFora);
    return () => document.removeEventListener("pointerdown", aoClicarFora);
  }, [aberto]);

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setAberto(false);
      botao.current?.focus();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const todos = itens();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      todos[(todos.indexOf(document.activeElement as HTMLElement) + passo + todos.length) % todos.length]?.focus();
    }
  }

  return (
    <div ref={raiz} className="relative shrink-0" onKeyDown={aoTeclar}>
      <button ref={botao} type="button" aria-haspopup="menu" aria-expanded={aberto} aria-label={rotulo} title={rotulo} onClick={() => setAberto(!aberto)} className={estilo}>
        {conteudoDoBotao}
      </button>
      {aberto && (
        <div ref={lista} role="menu" aria-label={rotulo} onClick={() => setAberto(false)} className={`absolute right-0 z-30 flex w-56 flex-col rounded-xl bg-surface p-1.5 shadow-lg ring-1 ring-black/10 ${paraCima ? "bottom-full mb-2" : "top-full mt-1"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
