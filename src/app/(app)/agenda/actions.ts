"use server";

import { createClient } from "@/lib/supabase/server";

/** Detalhes de um atendimento para o painel lateral. */
export async function detalhesAtendimento(id: string) {
  const supabase = await createClient();

  const { data: atendimento, error } = await supabase
    .from("atendimentos")
    .select(
      `id, inicio, fim, status, valor, observacao,
       profissional:profissionais(nome, especialidade),
       plano:planos(nome, cor),
       tipo:tipos_atendimento(nome),
       paciente:pacientes(id, nome, responsavel, data_nascimento, celular, email, plano:planos(nome))`,
    )
    .eq("id", id)
    .single();
  if (error) throw new Error("Atendimento não encontrado.");

  return { atendimento };
}

export type DetalhesAtendimento = Awaited<ReturnType<typeof detalhesAtendimento>>;
