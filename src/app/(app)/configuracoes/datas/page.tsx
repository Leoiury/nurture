import type { Metadata } from "next";
import { dataNoAno, descreverRegra } from "@/lib/agenda/lembretes";
import { hoje } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";
import { ListaDeDatas } from "./lista-de-datas";

export const metadata: Metadata = { title: "Datas comemorativas · Nurture" };

export default async function DatasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("datas_comemorativas").select("id, nome, descricao, mes, dia, ordem, dia_semana, pascoa");
  if (error) throw new Error("Não foi possível carregar as datas.");

  // Em ordem de próxima ocorrência (a partir de hoje).
  const dataHoje = hoje();
  const ano = Number(dataHoje.slice(0, 4));
  const proxima = (d: (typeof data)[number]) => [ano, ano + 1, ano + 2].map((a) => dataNoAno(d, a)).find((x) => x && x >= dataHoje) ?? "9999";
  const datas = data
    .map((d) => ({ id: d.id, nome: d.nome, descricao: d.descricao, regra: descreverRegra(d), proxima: proxima(d) }))
    .sort((a, b) => a.proxima.localeCompare(b.proxima));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Datas lembradas na agenda com 15 dias de antecedência (ícone de estrela) e destacadas no próprio dia. Repetem todo ano: fixas (12 de
        outubro, último dia de fevereiro), por dia da semana (2º domingo de maio) ou pela Páscoa (Carnaval).
      </p>
      <ListaDeDatas datas={datas} />
    </div>
  );
}
