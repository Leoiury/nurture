"use server";

import { createClient } from "@/lib/supabase/server";

/** Detalhes de um atendimento para o painel lateral, com o histórico do paciente. */
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

  const historico = atendimento.paciente
    ? await supabase
        .from("atendimentos")
        .select("id, inicio, status, profissional:profissionais(nome), tipo:tipos_atendimento(nome)")
        .eq("paciente_id", atendimento.paciente.id)
        .order("inicio", { ascending: false })
        .limit(50)
    : null;
  if (historico?.error) throw new Error("Não foi possível carregar o histórico.");

  return { atendimento, historico: historico?.data ?? [] };
}

export type DetalhesAtendimento = Awaited<ReturnType<typeof detalhesAtendimento>>;
