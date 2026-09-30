import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarEscalas, carregarMapaDeOcupacao } from "@/lib/agenda/dados";
import { formatarDuracao } from "@/lib/agenda/ocupacao";
import { FUSO, hoje, inicioDaSemana, inicioDoDiaISO, inicioDoMes, somarDias } from "@/lib/agenda/tempo";
import { ehAdm } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { CabecalhoDoProfissional } from "./cabecalho-do-profissional";
import { EscalaDoProfissional } from "./escala-do-profissional";

export const metadata: Metadata = { title: "Profissional · Nurture" };

const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Periodo = "dia" | "semana" | "mes";
const PERIODOS: [Periodo, string][] = [
  ["dia", "Hoje"],
  ["semana", "Esta semana"],
  ["mes", "Este mês"],
];

export default async function ProfissionalPage({ params, searchParams }: PageProps<"/profissionais/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { periodo: periodoParam } = await searchParams;
  const periodo: Periodo = periodoParam === "dia" || periodoParam === "mes" ? periodoParam : "semana";
  const supabase = await createClient();

  // Números da agenda: últimos 90 dias e próximos 60.
  const dataHoje = hoje();
  const desde = somarDias(dataHoje, -90);
  const ate = somarDias(dataHoje, 60);
  // Período do mapa de ocupação.
  const [periodoDe, periodoAte] =
    periodo === "dia"
      ? [dataHoje, dataHoje]
      : periodo === "mes"
        ? [inicioDoMes(dataHoje), somarDias(inicioDoMes(somarDias(inicioDoMes(dataHoje), 32)), -1)]
        : [inicioDaSemana(dataHoje), somarDias(inicioDaSemana(dataHoje), 6)];
  const [profissional, tipos, atendimentos, escalas, mapas] = await Promise.all([
    supabase.from("profissionais").select("id, nome, especialidade, registro, celular, email, ativo").eq("id", id).maybeSingle(),
    supabase.from("tipos_atendimento").select("id, nome, vinculos:tipos_atendimento_profissionais(profissional_id)").eq("ativo", true).order("nome"),
    supabase
      .from("atendimentos")
      .select("id, inicio, status, paciente:pacientes(id, nome), tipo:tipos_atendimento(nome), ap:atendimento_profissionais!inner(profissional_id)")
      .eq("ap.profissional_id", id)
      .is("excluido_em", null)
      .gte("inicio", inicioDoDiaISO(desde))
      .lt("inicio", inicioDoDiaISO(ate))
      .order("inicio")
      .limit(3000),
    carregarEscalas([id]),
    carregarMapaDeOcupacao([id], periodoDe, periodoAte),
  ]);
  const mapa = mapas.get(id)!;
  const t = mapa.total;
  const pct = (parte: number) => (t.escala ? ` (${Math.round((100 * parte) / t.escala)}%)` : "");
  if (profissional.error || tipos.error || atendimentos.error) throw new Error("Não foi possível carregar o profissional.");
  const p = profissional.data;
  if (!p) notFound();
  const adm = await ehAdm();

  const validos = atendimentos.data.filter((a) => a.status !== "desmarcado").map((a) => ({ ...a, ms: Date.parse(a.inicio) }));
  const agora = Date.parse(new Date().toISOString());
  const inicioDe = (data: string) => Date.parse(inicioDoDiaISO(data));
  const noPeriodo = (de: string, ateExclusive: string) => validos.filter((a) => a.ms >= inicioDe(de) && a.ms < inicioDe(ateExclusive)).length;
  const segunda = inicioDaSemana(dataHoje);
  const primeiroDoMes = inicioDoMes(dataHoje);
  const proximoMes = inicioDoMes(somarDias(primeiroDoMes, 32));
  const passados = validos.filter((a) => a.ms < agora);
  const atendidos = passados.filter((a) => a.status === "atendido").length;
  const faltas = passados.filter((a) => a.status === "faltou").length;
  const pacientes = new Set(passados.map((a) => a.paciente?.id).filter(Boolean)).size;
  const proximos = validos.filter((a) => a.ms >= agora && (a.status === "marcado" || a.status === "confirmado"));

  const dele = tipos.data.filter((t) => t.vinculos.some((v) => v.profissional_id === id));
  const abertos = tipos.data.filter((t) => t.vinculos.length === 0);

  const numeros: [string, string][] = [
    ["Esta semana", String(noPeriodo(segunda, somarDias(segunda, 7)))],
    ["Este mês", String(noPeriodo(primeiroDoMes, proximoMes))],
    ["Pacientes (90 dias)", String(pacientes)],
    ["Presença (90 dias)", atendidos + faltas ? `${Math.round((100 * atendidos) / (atendidos + faltas))}%` : "—"],
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/profissionais" className="text-sm text-muted hover:text-foreground">
        ← Profissionais
      </Link>
      <CabecalhoDoProfissional profissional={p} futuros={proximos.length} podeEditar={adm} />

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5" aria-label="Informações do profissional">
          <h2 className="mb-3 font-semibold">Informações</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Especialidade</dt>
            <dd>{p.especialidade || <span className="text-muted">—</span>}</dd>
            <dt className="text-muted">Registro</dt>
            <dd>{p.registro || <span className="text-muted">—</span>}</dd>
            <dt className="text-muted">Celular</dt>
            <dd>
              {p.celular ? (
                <a href={`tel:${p.celular.replace(/\D/g, "")}`} className="text-accent hover:underline">
                  {p.celular}
                </a>
              ) : (
                <span className="text-muted">—</span>
              )}
            </dd>
            <dt className="text-muted">E-mail</dt>
            <dd className="min-w-0 break-words">{p.email || <span className="text-muted">—</span>}</dd>
          </dl>
        </section>

        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5" aria-label="Tipos que atende">
          <h2 className="font-semibold">Tipos que atende</h2>
          {dele.length === 0 && abertos.length === 0 ? (
            <p className="text-sm text-muted">Nenhum tipo vinculado.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5 text-sm">
              {dele.map((t) => (
                <li key={t.id} className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">
                  {t.nome}
                </li>
              ))}
              {abertos.map((t) => (
                <li key={t.id} className="rounded-full bg-black/[0.04] px-2.5 py-1 text-muted" title="Aberto a qualquer profissional">
                  {t.nome}
                </li>
              ))}
            </ul>
          )}
          <Link href="/configuracoes/tipos" className="mt-auto text-xs text-accent hover:underline">
            Alterar em Tipos de atendimento
          </Link>
        </section>
      </div>

      <EscalaDoProfissional profissionalId={id} escala={escalas.get(id) ?? null} podeEditar={adm} />

      <section aria-label="Ocupação" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Ocupação</h2>
          <nav aria-label="Período" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
            {PERIODOS.map(([v, rotulo]) => (
              <Link
                key={v}
                href={`/profissionais/${id}?periodo=${v}`}
                aria-current={periodo === v ? "page" : undefined}
                scroll={false}
                className={`rounded-full px-3 py-1 ${periodo === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {rotulo}
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Na escala", formatarDuracao(t.escala), "Tempo de trabalho no período, sem feriados e recessos"],
              ["Em atendimento", formatarDuracao(t.ocupado) + pct(t.ocupado - t.foraDaEscala), t.foraDaEscala ? `${formatarDuracao(t.foraDaEscala)} fora da escala` : ""],
              ["Livre", formatarDuracao(t.livre) + pct(t.livre), "Na escala, sem atendimento"],
              [
                "Não otimizado",
                formatarDuracao(t.naoOtimizado),
                t.desperdicios ? `${t.desperdicios} intervalo${t.desperdicios === 1 ? "" : "s"} entre 5 e 30 min` : "Nenhum intervalo entre 5 e 30 min",
              ],
            ] as const
          ).map(([rotulo, valor, detalhe]) => (
            <div key={rotulo} className="rounded-2xl bg-surface px-4 py-3 shadow-sm ring-1 ring-black/5">
              <p className="text-xs text-muted">{rotulo}</p>
              <p className="text-xl font-semibold tabular-nums">{valor}</p>
              {detalhe && <p className="text-[11px] text-muted">{detalhe}</p>}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Números da agenda" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-2xl bg-surface px-4 py-3 shadow-sm ring-1 ring-black/5">
            <p className="text-xs text-muted">{rotulo}</p>
            <p className="text-2xl font-semibold tabular-nums">{valor}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-label="Próximos atendimentos">
        <h2 className="font-semibold">Próximos atendimentos</h2>
        {proximos.length === 0 ? (
          <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhum atendimento marcado.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5 text-sm">
            {proximos.slice(0, 12).map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-36 shrink-0 text-muted tabular-nums first-letter:uppercase">{quando.format(new Date(a.inicio)).replace(".", "")}</span>
                {a.paciente ? (
                  <Link href={`/pacientes/${a.paciente.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
                    {a.paciente.nome}
                  </Link>
                ) : (
                  <span className="flex-1 text-muted">—</span>
                )}
                <span className="hidden truncate text-xs text-muted sm:block">{a.tipo?.nome}</span>
              </li>
            ))}
          </ul>
        )}
        {proximos.length > 12 && <p className="text-xs text-muted">e mais {proximos.length - 12} nos próximos 60 dias.</p>}
      </section>
    </div>
  );
}
