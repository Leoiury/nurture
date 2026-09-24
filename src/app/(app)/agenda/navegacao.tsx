import Link from "next/link";
import {
  diaDoMes,
  inicioDaSemana,
  inicioDoMes,
  nomeDoMes,
  semanasDoMes,
  somarDias,
  somarMeses,
} from "@/lib/agenda/tempo";
import { sufixoDaVisao, type Visao } from "@/lib/agenda/visao";

/**
 * referencia: data que define o mês exibido (e a semana, via inicioDaSemana).
 * visao: preservada em todos os links.
 * variante: "barra" (linha no topo da agenda) ou "menu" (em coluna, dentro do menu lateral).
 */
type Props = { referencia: string; dia: string | null; hoje: string; visao: Visao; variante?: "barra" | "menu" };

const botao =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-surface px-3 text-sm shadow-sm ring-1 ring-black/5 transition hover:shadow";

function rotuloSemana(segunda: string): string {
  const sexta = somarDias(segunda, 4);
  const mesDiferente = segunda.slice(5, 7) !== sexta.slice(5, 7);
  const fmt = (d: string) => `${diaDoMes(d)}${mesDiferente ? `/${d.slice(5, 7)}` : ""}`;
  return `${fmt(segunda)}–${fmt(sexta)}`;
}

/** Link para uma semana mantendo o mês: aponta para o primeiro dia dela dentro do mês. */
function linkSemana(segunda: string, mes: string, sufixo: string): string {
  const primeiro = inicioDoMes(mes);
  return `/agenda?semana=${segunda < primeiro ? primeiro : segunda}${sufixo}`;
}

function linkMes(referencia: string, meses: number, sufixo: string): string {
  const mes = somarMeses(referencia, meses);
  return linkSemana(semanasDoMes(mes)[0], mes, sufixo);
}

export function Navegacao({ referencia, dia, hoje, visao, variante = "barra" }: Props) {
  const noMenu = variante === "menu";
  const sufixo = sufixoDaVisao(visao);
  const segunda = inicioDaSemana(referencia);
  const semanas = semanasDoMes(referencia);
  const semanaHoje = inicioDaSemana(hoje);

  return (
    <div className={noMenu ? "flex flex-col items-start gap-3" : "flex flex-wrap items-center gap-x-4 gap-y-3"}>
      <div className="flex items-center gap-1.5">
        <Link href={linkMes(referencia, -1, sufixo)} className={botao} aria-label="Mês anterior">
          ‹
        </Link>
        <h1 className="min-w-40 text-center text-lg font-semibold tracking-tight">{nomeDoMes(referencia)}</h1>
        <Link href={linkMes(referencia, 1, sufixo)} className={botao} aria-label="Próximo mês">
          ›
        </Link>
      </div>

      {dia ? (
        <div className="flex items-center gap-1.5">
          <Link href={linkSemana(segunda, referencia, sufixo)} className={botao}>
            ← Semana
          </Link>
          <Link href={`/agenda?dia=${somarDias(dia, -1)}${sufixo}`} className={botao} aria-label="Dia anterior">
            ‹
          </Link>
          <Link href={`/agenda?dia=${somarDias(dia, 1)}${sufixo}`} className={botao} aria-label="Próximo dia">
            ›
          </Link>
        </div>
      ) : (
        <nav
          aria-label="Semanas do mês"
          className={`flex max-w-full gap-0.5 bg-black/[0.04] p-1 ${noMenu ? "flex-wrap rounded-2xl" : "overflow-x-auto rounded-full"}`}
        >
          {semanas.map((s) => {
            const atual = s === segunda;
            return (
              <Link
                key={s}
                href={linkSemana(s, referencia, sufixo)}
                aria-current={atual ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1 text-sm tabular-nums transition ${
                  atual ? "bg-surface font-medium shadow-sm" : s === semanaHoje ? "text-accent hover:bg-surface/60" : "text-muted hover:bg-surface/60 hover:text-foreground"
                }`}
              >
                {rotuloSemana(s)}
              </Link>
            );
          })}
        </nav>
      )}

      <Link href={`/agenda${sufixo.replace("&", "?")}`} className={noMenu ? botao : `${botao} ml-auto`}>
        Hoje
      </Link>
    </div>
  );
}
