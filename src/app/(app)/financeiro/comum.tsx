// Peças comuns às telas do financeiro: cabeçalho com o seletor de mês e formatos.

import Link from "next/link";
import { nomeDoMes, somarMeses } from "@/lib/agenda/tempo";

export const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const formatoData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
/** "2026-10-06" → "06/10" */
export const dataCurta = (data: string) => formatoData.format(new Date(`${data}T12:00:00Z`));

export const entrada =
  "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** "2026-10-01" → "2026-10" (como vai na URL). */
export const mesNaUrl = (mes: string) => mes.slice(0, 7);

/**
 * Título da tela, link de volta ao painel (nas telas internas) e seletor de mês.
 * `caminho` + `extras` montam os links de mês anterior/seguinte mantendo a tela.
 */
export function CabecalhoDoFinanceiro({
  titulo,
  mes,
  caminho,
  extras = "",
  voltar = true,
  comMes = true,
  children,
}: {
  titulo: string;
  mes: string;
  caminho: string;
  extras?: string;
  voltar?: boolean;
  /** false: telas que não são de um mês (ex.: em aberto de todos os meses). */
  comMes?: boolean;
  children?: React.ReactNode;
}) {
  const link = (m: string) => `${caminho}?mes=${mesNaUrl(m)}${extras}`;
  return (
    <header className="flex flex-col gap-2">
      {voltar && (
        <Link href={`/financeiro?mes=${mesNaUrl(mes)}`} className="self-start text-sm text-muted hover:text-foreground">
          ← Financeiro
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {comMes && (
            <nav aria-label="Mês" className="flex items-center gap-1 rounded-full bg-surface p-1 text-sm shadow-sm ring-1 ring-black/5">
              <Link
                href={link(somarMeses(mes, -1))}
                aria-label="Mês anterior"
                className="rounded-full px-2.5 py-1 text-muted hover:bg-background hover:text-foreground"
              >
                ‹
              </Link>
              <span className="min-w-36 text-center font-medium" data-mes={mesNaUrl(mes)}>
                {nomeDoMes(mes)}
              </span>
              <Link
                href={link(somarMeses(mes, 1))}
                aria-label="Próximo mês"
                className="rounded-full px-2.5 py-1 text-muted hover:bg-background hover:text-foreground"
              >
                ›
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}

/** Seta de "abrir" usada nos cards clicáveis. */
export function Seta() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 transition group-hover:translate-x-0.5">
      <path d="M3 8h9m-3.5-3.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
