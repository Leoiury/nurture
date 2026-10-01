"use server";

import { revalidatePath } from "next/cache";
import { PALETA_PLANOS } from "@/lib/agenda/cores";
import type { Area } from "@/lib/agenda/valores";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true; reajustados?: number } | { ok: false; erro: string };

export type DadosDoPlano = {
  id?: string; // ausente: novo plano
  nome: string;
  cor: string;
  duracaoMin: number;
  valor: number | null;
  /** Valor por área do tipo de atendimento (vazio = usa o valor padrão). */
  valoresPorArea: Record<Area, number | null>;
  ativo: boolean;
  /** Mudou valor: os atendimentos futuros deste plano com o valor antigo passam ao novo. */
  reajustarFuturos?: boolean;
};

function revalidar() {
  revalidatePath("/configuracoes/planos");
  revalidatePath("/agenda");
}

export async function salvarPlano(p: DadosDoPlano): Promise<Resultado> {
  const nome = p.nome.trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome." };
  if (!PALETA_PLANOS.some((c) => c.hex.toLowerCase() === p.cor.toLowerCase())) return { ok: false, erro: "Escolha uma cor da paleta." };
  if (!(Number.isInteger(p.duracaoMin) && p.duracaoMin >= 5 && p.duracaoMin <= 720)) return { ok: false, erro: "Duração inválida." };
  if (p.valor !== null && !(p.valor >= 0)) return { ok: false, erro: "Valor inválido." };
  const porArea = p.valoresPorArea;
  if (Object.values(porArea).some((v) => v !== null && !(v >= 0))) return { ok: false, erro: "Valor por área inválido." };

  const supabase = await createClient();
  const dados = {
    nome,
    cor: p.cor,
    duracao_padrao_min: p.duracaoMin,
    valor_padrao: p.valor,
    valor_fonoaudiologia: porArea.fonoaudiologia,
    valor_psicologia: porArea.psicologia,
    valor_nutricao: porArea.nutricao,
    valor_psicopedagogia: porArea.psicopedagogia,
    ativo: p.ativo,
  };
  // Valores antes da mudança: o reajuste só alcança quem estava com o valor antigo.
  const antes = p.id && p.reajustarFuturos
    ? (await supabase.from("planos").select("valor_padrao, valor_fonoaudiologia, valor_psicologia, valor_nutricao, valor_psicopedagogia").eq("id", p.id).single()).data
    : null;
  const { error } = p.id ? await supabase.from("planos").update(dados).eq("id", p.id) : await supabase.from("planos").insert(dados);
  if (error) return { ok: false, erro: error.code === "23505" ? "Já existe um plano com esse nome." : "Não foi possível salvar." };

  let reajustados: number | undefined;
  if (p.id && antes) {
    const antigos = {
      padrao: antes.valor_padrao,
      fonoaudiologia: antes.valor_fonoaudiologia,
      psicologia: antes.valor_psicologia,
      nutricao: antes.valor_nutricao,
      psicopedagogia: antes.valor_psicopedagogia,
    };
    const r = await supabase.rpc("reajustar_plano", { p_plano: p.id, p_antigos: antigos });
    if (r.error) return { ok: false, erro: "O plano foi salvo, mas não foi possível reajustar os atendimentos futuros." };
    reajustados = r.data;
    revalidatePath("/pacientes", "layout");
  }
  revalidar();
  return { ok: true, reajustados };
}

/** Só planos sem uso podem ser excluídos; os em uso são desativados (o histórico continua certo). */
export async function excluirPlano(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const [atendimentos, pacientes] = await Promise.all([
    supabase.from("atendimentos").select("id", { count: "exact", head: true }).eq("plano_id", id),
    supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("plano_id", id),
  ]);
  if ((atendimentos.count ?? 0) + (pacientes.count ?? 0) > 0) return { ok: false, erro: "Plano em uso: desative em vez de excluir." };
  const { error } = await supabase.from("planos").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidar();
  return { ok: true };
}
