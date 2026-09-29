"use server";

// Planejamento da agenda: guardar o rascunho, descartá-lo e aplicá-lo.
// Só ADMs (perfil direcao/dev): o banco confere (RLS e aplicar_planejamento).

import { revalidatePath } from "next/cache";
import { lerErroDeAplicacao, type Operacao } from "@/lib/agenda/planejamento";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type ResultadoPlanejamento = { ok: true } | { ok: false; erro: string };
export type ResultadoAplicacao = { ok: true; quantidade: number } | { ok: false; erro: string; chave?: string };

export async function salvarPlanejamento(operacoes: Operacao[]): Promise<ResultadoPlanejamento> {
  const supabase = await createClient();
  const { error } = await supabase.from("planejamento").upsert({ unico: true, operacoes: operacoes as unknown as Json });
  return error ? { ok: false, erro: "Não foi possível salvar o planejamento." } : { ok: true };
}

export async function descartarPlanejamento(): Promise<ResultadoPlanejamento> {
  const supabase = await createClient();
  const { error } = await supabase.from("planejamento").delete().eq("unico", true);
  if (error) return { ok: false, erro: "Não foi possível descartar o planejamento." };
  revalidatePath("/agenda");
  return { ok: true };
}

/**
 * Aplica as operações escolhidas numa única transação (tudo ou nada). As que
 * ficaram de fora continuam no rascunho.
 */
export async function aplicarPlanejamento(escolhidas: Operacao[], restantes: Operacao[]): Promise<ResultadoAplicacao> {
  if (escolhidas.length === 0) return { ok: false, erro: "Nenhuma alteração escolhida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aplicar_planejamento", { p_operacoes: escolhidas as unknown as Json });
  if (error) {
    const lido = lerErroDeAplicacao(error.message);
    return lido ? { ok: false, erro: lido.motivo, chave: lido.chave } : { ok: false, erro: error.message };
  }
  // aplicar_planejamento apaga o rascunho; o que não foi aplicado volta para ele.
  if (restantes.length) await salvarPlanejamento(restantes);
  revalidatePath("/agenda");
  revalidatePath("/pacientes", "layout");
  return { ok: true, quantidade: data };
}
