import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FUSO, hoje, inicioDaSemana, inicioDoDiaISO, inicioDoMes, somarDias } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";
import { CabecalhoDoProfissional } from "./cabecalho-do-profissional";

export const metadata: Metadata = { title: "Profissional · Nurture" };

const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function ProfissionalPage({ params }: PageProps<"/profissionais/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  // Números da agenda: últimos 90 dias e próximos 60.
  const dataHoje = hoje();
  const desde = somarDias(dataHoje, -90);
  const ate = somarDias(dataHoje, 60);
  const [profissional, tipos, atendimentos] = await Promise.all([
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
  ]);
  if (profissional.error || tipos.error || atendimentos.error) throw new Error("Não foi possível carregar o profissional.");
  const p = profissional.data;
  if (!p) notFound();

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
      <CabecalhoDoProfissional profissional={p} futuros={proximos.length} />

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
