"use server";

// Dados dos filtros avançados da agenda.

import { createClient } from "@/lib/supabase/server";

/** Pacientes ativos (id e nome), para a pesquisa do filtro por paciente. */
export async function pacientesParaFiltro(): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pacientes").select("id, nome").eq("ativo", true).order("nome");
  if (error) throw new Error("Não foi possível carregar os pacientes.");
  return data;
}
