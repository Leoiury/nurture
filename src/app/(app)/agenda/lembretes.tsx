"use client";

// Lembretes na agenda: aniversários (bolo) e datas comemorativas (estrela).
// Na barra, cada ícone fica discreto sem nada nos próximos 15 dias; com algo,
// ganha cor e mostra a quantidade, e abre a lista.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Aniversario, Comemoracao } from "@/lib/agenda/lembretes";
import { ANTECEDENCIA_DIAS } from "@/lib/agenda/lembretes";
import { nomeCurtoDoDia } from "@/lib/agenda/tempo";

export function IconeBolo({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.2c.7.6.9 1.3.5 1.8-.3.4-.9.4-1.2 0-.3-.5 0-1.1.7-1.8Z" fill="currentColor" />
      <path d="M8 4.6v1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="3" y="6.6" width="10" height="3.4" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.2 13.6h11.6M3 10v3.6M13 10v3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M3 8.6c.8.6 1.7.6 2.5 0s1.7-.6 2.5 0 1.7.6 2.5 0 1.7-.6 2.5 0" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function IconeEstrela({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m8 1.8 1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.1l-3.7 2 .8-4.1-3-2.9 4.1-.5L8 1.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
    </svg>
  );
}

/** Estrela + nome(s) no cabeçalho do dia. */
export function EtiquetaComemoracao({ nomes, compacta = false }: { nomes: string[] | undefined; compacta?: boolean }) {
  if (!nomes?.length) return null;
  return (
    <span
      title={`Data comemorativa: ${nomes.join(" · ")}`}
      data-comemoracao
      className={`inline-flex max-w-full min-w-0 items-center gap-1 truncate rounded-full bg-violet-100 px-2 py-px font-medium text-violet-900 ${
        compacta ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <IconeEstrela tamanho={11} />
      <span className="truncate">{nomes.join(" · ")}</span>
    </span>
  );
}

const quando = (data: string, hoje: string) => {
  if (data === hoje) return "hoje";
  const [, m, d] = data.split("-");
  return `${nomeCurtoDoDia(data)} ${d}/${m}`;
};

type Props = { aniversarios: Aniversario[]; comemoracoes: Comemoracao[]; hoje: string };

export function BotoesDeLembrete({ aniversarios, comemoracoes, hoje }: Props) {
  const [aberto, setAberto] = useState<"aniversarios" | "comemoracoes" | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(null);
    window.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const botao = (tipo: "aniversarios" | "comemoracoes", quantidade: number, icone: React.ReactNode, cor: string, rotulo: string) => (
    <button
      type="button"
      onClick={() => setAberto(aberto === tipo ? null : tipo)}
      aria-expanded={aberto === tipo}
      aria-label={`${rotulo}: ${quantidade} nos próximos ${ANTECEDENCIA_DIAS} dias`}
      title={`${rotulo} nos próximos ${ANTECEDENCIA_DIAS} dias`}
      data-quantidade={quantidade}
      className={`relative inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-sm shadow-sm ring-1 ring-black/5 transition hover:shadow ${
        quantidade ? `${cor} font-semibold` : "bg-surface text-muted/50"
      }`}
    >
      {icone}
      {quantidade > 0 && <span className="tabular-nums">{quantidade}</span>}
    </button>
  );

  return (
    <div ref={caixa} className="relative flex items-center gap-1.5">
      {botao("aniversarios", aniversarios.length, <IconeBolo />, "bg-pink-100 text-pink-800", "Aniversários")}
      {botao("comemoracoes", comemoracoes.length, <IconeEstrela />, "bg-violet-100 text-violet-800", "Datas comemorativas")}
      {aberto && (
        <div
          role="dialog"
          aria-label={aberto === "aniversarios" ? "Próximos aniversários" : "Próximas datas comemorativas"}
          className="absolute top-full right-0 z-40 mt-2 w-72 rounded-2xl bg-surface p-3 text-sm shadow-xl ring-1 ring-black/10"
        >
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {aberto === "aniversarios" ? "Aniversários" : "Datas comemorativas"} · próximos {ANTECEDENCIA_DIAS} dias
          </p>
          {aberto === "aniversarios" ? (
            aniversarios.length === 0 ? (
              <p className="text-muted">Nenhum aniversário de paciente.</p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {aniversarios.map((a) => (
                  <li key={`${a.pacienteId}${a.data}`}>
                    <Link href={`/pacientes/${a.pacienteId}`} className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 hover:bg-background">
                      <span className={`w-20 shrink-0 text-xs tabular-nums ${a.data === hoje ? "font-semibold text-pink-700" : "text-muted"}`}>{quando(a.data, hoje)}</span>
                      <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                      <span className="shrink-0 text-xs text-muted">{a.idade} anos</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : comemoracoes.length === 0 ? (
            <p className="text-muted">
              Nenhuma data comemorativa.{" "}
              <Link href="/configuracoes/datas" className="text-accent hover:underline">
                Cadastrar datas
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {comemoracoes.map((c) => (
                <li key={`${c.id}${c.data}`} className="flex items-baseline gap-2 px-2 py-1.5">
                  <span className={`w-20 shrink-0 text-xs tabular-nums ${c.data === hoje ? "font-semibold text-violet-700" : "text-muted"}`}>{quando(c.data, hoje)}</span>
                  <span className="min-w-0 flex-1">
                    {c.nome}
                    {c.descricao && <span className="block text-xs text-muted">{c.descricao}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
