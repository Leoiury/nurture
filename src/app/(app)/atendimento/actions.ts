"use server";

// Ações do registro de atendimento. Quem pode o quê está no banco (migration do registro).

import { revalidatePath } from "next/cache";
import { conteudoVazio, type ConteudoDoRegistro, type ModeloDoRegistro } from "@/lib/atendimento/conteudo";
import { usuarioAtual } from "@/lib/auth/usuario";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type Resultado = { ok: true } | { ok: false; erro: string };

export async function guardarRegistro(id: string, conteudo: ConteudoDoRegistro): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_rascunho_registro", { p_atendimento: id, p_conteudo: conteudo as unknown as Json });
  return error ? { ok: false, erro: "Não foi possível guardar o texto." } : { ok: true };
}

/** Grava uma nova versão; finalizar também marca o atendimento como atendido. */
export async function salvarRegistro(id: string, conteudo: ConteudoDoRegistro, finalizar: boolean): Promise<Resultado> {
  // O rascunho é gravado de novo: o último trecho digitado pode não ter sido guardado ainda.
  const guardado = await guardarRegistro(id, conteudo);
  if (!guardado.ok) return guardado;
  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_registro", { p_atendimento: id, p_finalizar: finalizar });
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };
  revalidatePath("/agenda");
  revalidatePath("/pacientes", "layout");
  revalidatePath(`/atendimento/${id}`);
  return { ok: true };
}

/** Recomeçar: o texto em andamento volta ao zero. As versões já salvas continuam guardadas. */
export async function recomecarAtendimento(id: string): Promise<Resultado> {
  const eu = await usuarioAtual();
  if (!eu?.profissionalId) return { ok: false, erro: "Este login não tem um profissional vinculado." };
  const supabase = await createClient();
  const [topicos, preferencia] = await Promise.all([
    supabase.from("atendimento_topicos").select("id, texto").order("ordem"),
    supabase.from("usuarios").select("modelo_atendimento").eq("id", eu.id).single(),
  ]);
  if (topicos.error || preferencia.error) return { ok: false, erro: "Não foi possível recomeçar." };
  const r = await guardarRegistro(id, conteudoVazio(preferencia.data.modelo_atendimento as ModeloDoRegistro, topicos.data));
  if (!r.ok) return { ok: false, erro: "Não foi possível recomeçar." };
  revalidatePath(`/atendimento/${id}`);
  return { ok: true };
}

/** O último modelo usado é o que abre no próximo atendimento. */
export async function definirModeloPreferido(modelo: ModeloDoRegistro): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("definir_modelo_atendimento", { p_modelo: modelo });
}
