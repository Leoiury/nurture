"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

/**
 * Confirma ou recusa um pedido de exclusão. `alvos`: um atendimento de cada série do
 * pedido; o banco aplica a decisão aos demais da mesma série pedidos no mesmo instante.
 */
export async function decidirExclusao(alvos: string[], confirmar: boolean): Promise<Resultado> {
  const supabase = await createClient();
  for (const id of alvos) {
    const { error } = await supabase.rpc(confirmar ? "confirmar_exclusao" : "recusar_exclusao", { p_id: id });
    if (error) return { ok: false, erro: confirmar ? "Não foi possível confirmar a exclusão." : "Não foi possível recusar o pedido." };
  }
  revalidatePath("/solicitacoes");
  revalidatePath("/agenda");
  return { ok: true };
}
