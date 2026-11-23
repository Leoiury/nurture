"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

/** Marca avisos como lidos pelo usuário logado. */
export async function marcarComoLidas(ids: string[]): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (ids.length === 0) return { ok: true };
  const eu = await usuarioAtual();
  if (!eu) return { ok: false, erro: "Entre de novo." };
  const supabase = await createClient();
  const { error } = await supabase.from("notificacoes_lidas").upsert(
    ids.map((id) => ({ notificacao_id: id, usuario_id: eu.id })),
    { onConflict: "notificacao_id,usuario_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, erro: "Não foi possível marcar como lida." };
  revalidatePath("/notificacoes");
  return { ok: true };
}

/** Tipo de atendimento "Devolutiva", para marcar a partir de uma pendência. */
export async function tipoDevolutiva(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tipos_atendimento").select("id").eq("devolutiva", true).eq("ativo", true).order("nome").limit(1).maybeSingle();
  return data?.id ?? null;
}
