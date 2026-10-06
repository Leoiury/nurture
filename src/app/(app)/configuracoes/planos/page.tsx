import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ListaDePlanos, type PlanoDaLista } from "./lista-de-planos";

export const metadata: Metadata = { title: "Planos · Nurture" };

export default async function PlanosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planos")
    .select(
      "id, nome, cor, duracao_padrao_min, valor_padrao, valor_fonoaudiologia, valor_psicologia, valor_nutricao, valor_psicopedagogia, exige_guia, ativo, atendimentos(count), pacientes(count)",
    )
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) throw error;

  const planos: PlanoDaLista[] = data.map((p) => ({
    id: p.id,
    nome: p.nome,
    cor: p.cor,
    duracaoMin: p.duracao_padrao_min,
    valor: p.valor_padrao,
    valoresPorArea: {
      fonoaudiologia: p.valor_fonoaudiologia,
      psicologia: p.valor_psicologia,
      nutricao: p.valor_nutricao,
      psicopedagogia: p.valor_psicopedagogia,
    },
    exigeGuia: p.exige_guia,
    ativo: p.ativo,
    atendimentos: p.atendimentos[0]?.count ?? 0,
    pacientes: p.pacientes[0]?.count ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        O plano define a cor do card na agenda e sugere a duração e o valor ao marcar um atendimento (o valor da área do tipo, se houver; senão, o valor padrão). Mudar esses padrões vale para os
        novos atendimentos; os já marcados não mudam.
      </p>
      <ListaDePlanos planos={planos} />
    </div>
  );
}
