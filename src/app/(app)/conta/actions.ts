"use server";

import { revalidatePath } from "next/cache";
import { PALETA_PLANOS, ROTULOS_DOS_STATUS } from "@/lib/agenda/cores";
import type { Status } from "@/lib/agenda/dados";
import { createClient } from "@/lib/supabase/server";

/** Guarda as cores do calendário do próprio login. Só cores da paleta. */
export async function salvarCoresDoCalendario(cores: Record<Status, string>): Promise<{ ok: true } | { ok: false; erro: string }> {
  const validas = new Set<string>(PALETA_PLANOS.map((c) => c.hex));
  if (ROTULOS_DOS_STATUS.some(([status]) => !validas.has(cores[status]))) return { ok: false, erro: "Escolha uma cor da paleta." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_cores_status", { p_cores: Object.fromEntries(ROTULOS_DOS_STATUS.map(([status]) => [status, cores[status]])) });
  if (error) return { ok: false, erro: "Não foi possível salvar as cores." };
  revalidatePath("/agenda");
  revalidatePath("/conta");
  return { ok: true };
}
