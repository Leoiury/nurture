import "server-only";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

/**
 * Pacientes que o profissional logado pediu para inativar: para ele, ficam entre os
 * inativos desde o pedido, até ele marcar "Ativo" de novo ou o pedido ser recusado.
 * Para os outros perfis, vazio.
 */
export async function pacientesOcultosParaMim(): Promise<Set<string>> {
  const eu = await usuarioAtual();
  if (eu?.perfil !== "profissional" || !eu.profissionalId) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inativacoes_pedidas")
    .select("paciente_id, decisao")
    .eq("profissional_id", eu.profissionalId)
    .is("reativado_em", null);
  if (error) throw new Error("Não foi possível carregar os pacientes.");
  return new Set(data.filter((p) => p.decisao !== "recusar").map((p) => p.paciente_id));
}

/** Tira da lista os pacientes que o profissional logado pediu para inativar. */
export async function semOsOcultos<T extends { id: string }>(pacientes: T[]): Promise<T[]> {
  const ocultos = await pacientesOcultosParaMim();
  return ocultos.size ? pacientes.filter((p) => !ocultos.has(p.id)) : pacientes;
}
