"use server";

// Ações da anamnese: o modelo de cada profissional e o preenchimento. Quem pode o
// quê está no banco (RLS e funções da migration da anamnese).

import { revalidatePath } from "next/cache";
import type { ItemDaAnamnese } from "@/lib/anamnese/conteudo";
import { usuarioAtual } from "@/lib/auth/usuario";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type Resultado = { ok: true } | { ok: false; erro: string };

export async function abrirAnamnese(pacienteId: string): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("iniciar_anamnese", { p_paciente: pacienteId });
  if (error) return { ok: false, erro: error.message };
  return { ok: true, id: data };
}

export async function guardarRascunho(id: string, itens: ItemDaAnamnese[], observacoes: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_rascunho_anamnese", { p_id: id, p_conteudo: itens as unknown as Json, p_observacoes: observacoes });
  return error ? { ok: false, erro: "Não foi possível guardar o texto." } : { ok: true };
}

export async function salvarAnamnese(id: string, itens: ItemDaAnamnese[], observacoes: string): Promise<Resultado> {
  // O rascunho é gravado de novo: o último trecho digitado pode não ter sido guardado ainda.
  const guardado = await guardarRascunho(id, itens, observacoes);
  if (!guardado.ok) return guardado;
  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_anamnese", { p_id: id });
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };
  revalidatePath("/pacientes", "layout");
  revalidatePath(`/anamnese/${id}`);
  return { ok: true };
}

export async function descartarEdicao(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("descartar_rascunho_anamnese", { p_id: id });
  if (error) return { ok: false, erro: "Não foi possível descartar as alterações." };
  revalidatePath(`/anamnese/${id}`);
  return { ok: true };
}

// Modelo ---------------------------------------------------------------------------

export async function adicionarPergunta(texto: string): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const eu = await usuarioAtual();
  if (!eu?.profissionalId) return { ok: false, erro: "Este login não tem um profissional vinculado." };
  if (!texto.trim()) return { ok: false, erro: "Escreva a pergunta." };
  const supabase = await createClient();
  const { data: ultima } = await supabase.from("anamnese_perguntas").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("anamnese_perguntas")
    .insert({ profissional_id: eu.profissionalId, texto: texto.trim(), ordem: (ultima?.ordem ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return { ok: false, erro: "Não foi possível adicionar a pergunta." };
  revalidatePath("/anamnese", "layout");
  return { ok: true, id: data.id };
}

export async function editarPergunta(id: string, texto: string): Promise<Resultado> {
  if (!texto.trim()) return { ok: false, erro: "A pergunta não pode ficar vazia." };
  const supabase = await createClient();
  const { error } = await supabase.from("anamnese_perguntas").update({ texto: texto.trim() }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível alterar a pergunta." };
  revalidatePath("/anamnese", "layout");
  return { ok: true };
}

/** As anamneses já salvas têm a própria cópia das perguntas: não mudam. */
export async function excluirPergunta(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("anamnese_perguntas").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir a pergunta." };
  revalidatePath("/anamnese", "layout");
  return { ok: true };
}

export async function reordenarPerguntas(ids: string[]): Promise<Resultado> {
  const supabase = await createClient();
  const resultados = await Promise.all(ids.map((id, i) => supabase.from("anamnese_perguntas").update({ ordem: i + 1 }).eq("id", id)));
  if (resultados.some((r) => r.error)) return { ok: false, erro: "Não foi possível salvar a nova ordem." };
  revalidatePath("/anamnese", "layout");
  return { ok: true };
}
