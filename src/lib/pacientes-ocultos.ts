import "server-only";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

/**
 * Pacientes que o profissional logado ocultou (excluindo os atendimentos futuros dele):
 * saem da lista dele até alguém marcar um atendimento entre os dois. Para os outros
 * perfis, vazio.
 */
export async function pacientesOcultosParaMim(): Promise<Set<string>> {
  const eu = await usuarioAtual();
  if (eu?.perfil !== "profissional" || !eu.profissionalId) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.from("pacientes_ocultos").select("paciente_id").eq("profissional_id", eu.profissionalId);
  if (error) throw new Error("Não foi possível carregar os pacientes.");
  return new Set(data.map((p) => p.paciente_id));
}

/** Tira da lista os pacientes que o profissional logado ocultou. */
export async function semOsOcultos<T extends { id: string }>(pacientes: T[]): Promise<T[]> {
  const ocultos = await pacientesOcultosParaMim();
  return ocultos.size ? pacientes.filter((p) => !ocultos.has(p.id)) : pacientes;
}
