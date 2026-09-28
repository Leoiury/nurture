"use server";

import { revalidatePath } from "next/cache";
import { ehDataValida } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true; desmarcados?: number } | { ok: false; erro: string };

/** Quantos atendimentos ainda marcados/confirmados existem no período. */
export async function contarAtendimentosNoPeriodo(inicio: string, fim: string): Promise<number> {
  if (!ehDataValida(inicio) || !ehDataValida(fim) || fim < inicio) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("atendimentos_ativos_no_periodo", { p_inicio: inicio, p_fim: fim });
  if (error) throw new Error("Não foi possível contar os atendimentos.");
  return data.length;
}

export type NovoFeriado = {
  nome: string;
  tipo: "feriado" | "recesso";
  inicio: string;
  fim: string;
  /** Desmarcar os atendimentos marcados/confirmados do período. */
  desmarcar: boolean;
};

export async function criarFeriado(novo: NovoFeriado): Promise<Resultado> {
  const nome = novo.nome.trim();
  if (!nome) return { ok: false, erro: "Informe o nome." };
  if (!ehDataValida(novo.inicio) || !ehDataValida(novo.fim)) return { ok: false, erro: "Informe as datas." };
  if (novo.fim < novo.inicio) return { ok: false, erro: "A data final é anterior à inicial." };

  const supabase = await createClient();
  const { error } = await supabase.from("feriados").insert({ nome, tipo: novo.tipo, data_inicio: novo.inicio, data_fim: novo.fim });
  if (error) return { ok: false, erro: "Não foi possível salvar." };

  let desmarcados: number | undefined;
  if (novo.desmarcar) {
    const r = await supabase.rpc("desmarcar_periodo", {
      p_inicio: novo.inicio,
      p_fim: novo.fim,
      p_motivo: `Feriado / recesso: ${nome}`,
    });
    if (r.error) return { ok: false, erro: "Salvo, mas não foi possível desmarcar os atendimentos." };
    desmarcados = r.data;
  }

  revalidatePath("/configuracoes/feriados");
  revalidatePath("/agenda");
  return { ok: true, desmarcados };
}

export async function removerFeriado(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("feriados").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível remover." };
  revalidatePath("/configuracoes/feriados");
  revalidatePath("/agenda");
  return { ok: true };
}
