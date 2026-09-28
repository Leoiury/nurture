import type { Metadata } from "next";
import { ROTULO_TIPO_DIA, feriadosNacionais } from "@/lib/agenda/feriados";
import { hoje } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";
import { FormFeriado, RemoverFeriado } from "./form-feriado";

export const metadata: Metadata = { title: "Feriados e recessos · Nurture" };

const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const data = (d: string) => formatoData.format(new Date(`${d}T12:00:00Z`));

export default async function FeriadosPage() {
  const dataHoje = hoje();
  const ano = Number(dataHoje.slice(0, 4));
  const supabase = await createClient();
  const { data: cadastrados, error } = await supabase
    .from("feriados")
    .select("id, nome, tipo, data_inicio, data_fim")
    .is("profissional_id", null)
    .gte("data_fim", `${ano - 1}-01-01`)
    .order("data_inicio");
  if (error) throw error;

  const proximos = cadastrados.filter((f) => f.data_fim >= dataHoje);
  const passados = cadastrados.filter((f) => f.data_fim < dataHoje).reverse();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="sr-only">Feriados e recessos</h2>
        <p className="text-sm text-muted">
          Os feriados nacionais já são conhecidos pelo sistema. Cadastre aqui os estaduais (SC), os municipais (Videira) e os recessos da
          clínica. Esses dias ficam destacados na agenda e são pulados nas séries e na busca de horários.
        </p>
      </div>

      <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-4 font-semibold">Cadastrar</h2>
        <FormFeriado />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Cadastrados</h2>
        {proximos.length === 0 && <p className="text-sm text-muted">Nenhum feriado ou recesso futuro cadastrado.</p>}
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5" aria-label="Feriados e recessos cadastrados">
          {proximos.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-20 shrink-0 text-xs font-medium text-amber-800">{ROTULO_TIPO_DIA[f.tipo]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.nome}</span>
                <span className="text-muted tabular-nums">
                  {data(f.data_inicio)}
                  {f.data_fim !== f.data_inicio && ` a ${data(f.data_fim)}`}
                </span>
              </span>
              <RemoverFeriado id={f.id} nome={f.nome} />
            </li>
          ))}
        </ul>
        {passados.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Anteriores ({passados.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 pl-4 text-muted">
              {passados.map((f) => (
                <li key={f.id}>
                  {data(f.data_inicio)}
                  {f.data_fim !== f.data_inicio && ` a ${data(f.data_fim)}`} · {f.nome}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Feriados nacionais de {ano} (automáticos)</summary>
        <ul className="mt-2 flex flex-col gap-1 pl-4">
          {feriadosNacionais(ano).map((f) => (
            <li key={`${f.data}${f.nome}`} className="tabular-nums">
              {data(f.data)} · {f.nome}
              {f.tipo === "facultativo" && <span className="text-muted"> (ponto facultativo)</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
