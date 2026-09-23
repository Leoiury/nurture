import Link from "next/link";
import {
  diaDoMes,
  inicioDaSemana,
  inicioDoMes,
  nomeDoMes,
  nomeLongoDoDia,
  semanasDoMes,
  somarDias,
  somarMeses,
} from "@/lib/agenda/tempo";

/** referencia: data que define o mês exibido (e a semana, via inicioDaSemana). */
type Props = { referencia: string; dia: string | null; hoje: string };

const botao =
  "inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-2.5 text-sm hover:bg-background";

function rotuloSemana(segunda: string): string {
  const sexta = somarDias(segunda, 4);
  const mesDiferente = segunda.slice(5, 7) !== sexta.slice(5, 7);
  const fmt = (d: string) => `${diaDoMes(d)}${mesDiferente ? `/${d.slice(5, 7)}` : ""}`;
  return `${fmt(segunda)}–${fmt(sexta)}`;
}

/** Link para uma semana mantendo o mês: aponta para o primeiro dia dela dentro do mês. */
function linkSemana(segunda: string, mes: string): string {
  const primeiro = inicioDoMes(mes);
  return `/agenda?semana=${segunda < primeiro ? primeiro : segunda}`;
}

function linkMes(referencia: string, meses: number): string {
  const mes = somarMeses(referencia, meses);
  return linkSemana(semanasDoMes(mes)[0], mes);
}

export function Navegacao({ referencia, dia, hoje }: Props) {
  const segunda = inicioDaSemana(referencia);
  const semanas = semanasDoMes(referencia);
  const semanaHoje = inicioDaSemana(hoje);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <Link href={linkMes(referencia, -1)} className={botao} aria-label="Mês anterior">
            ‹
          </Link>
          <h1 className="min-w-44 text-center text-lg font-semibold tracking-tight">{nomeDoMes(referencia)}</h1>
          <Link href={linkMes(referencia, 1)} className={botao} aria-label="Próximo mês">
            ›
          </Link>
        </div>

        <nav aria-label="Semanas do mês" className="flex flex-wrap gap-1">
          {semanas.map((s) => {
            const atual = !dia && s === segunda;
            return (
              <Link
                key={s}
                href={linkSemana(s, referencia)}
                aria-current={atual ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-sm tabular-nums ${
                  atual ? "bg-accent text-white" : s === semanaHoje ? "bg-accent-soft text-accent" : "hover:bg-surface"
                }`}
              >
                {rotuloSemana(s)}
              </Link>
            );
          })}
        </nav>

        <Link href="/agenda" className={`${botao} ml-auto`}>
          Hoje
        </Link>
      </div>

      {dia && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={linkSemana(segunda, referencia)} className={botao}>
            ← Semana
          </Link>
          <Link href={`/agenda?dia=${somarDias(dia, -1)}`} className={botao} aria-label="Dia anterior">
            ‹
          </Link>
          <Link href={`/agenda?dia=${somarDias(dia, 1)}`} className={botao} aria-label="Próximo dia">
            ›
          </Link>
          <h2 className="text-base font-medium first-letter:uppercase">{nomeLongoDoDia(dia)}</h2>
        </div>
      )}
    </div>
  );
}
