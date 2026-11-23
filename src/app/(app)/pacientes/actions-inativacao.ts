"use server";

// Atendimentos de agora em diante do paciente: a recepção e o ADM excluem (de todos ou
// dos profissionais escolhidos); o profissional exclui os dele e oculta o paciente.

import { revalidatePath } from "next/cache";
import { ehProfissional, usuarioAtual } from "@/lib/auth/usuario";
import { ATENDIMENTOS_SEM_VALOR } from "@/lib/agenda/sem-valor";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true; quantidade: number } | { ok: false; erro: string };

export type FuturosPorProfissional = { id: string; nome: string; quantidade: number };

function revalidar(pacienteId: string) {
  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/pacientes");
  revalidatePath("/agenda");
  revalidatePath("/notificacoes");
}

/** Mensagem do banco quando é uma regra nossa; senão, a genérica. */
function concluir(error: { message: string; code?: string } | null, quantidade: number | null, generica: string): Resultado {
  if (!error) return { ok: true, quantidade: quantidade ?? 0 };
  return { ok: false, erro: error.code === "P0001" ? error.message : generica };
}

/** Atendimentos de agora em diante, por profissional. O profissional só conta os dele. */
export async function atendimentosFuturos(pacienteId: string): Promise<FuturosPorProfissional[]> {
  const [supabase, profissional, eu] = await Promise.all([createClient(), ehProfissional(), usuarioAtual()]);
  const { data, error } = await supabase
    .from(profissional ? ATENDIMENTOS_SEM_VALOR : "atendimentos")
    .select("id, profissionais:atendimento_profissionais(profissional:profissionais(id, nome))")
    .eq("paciente_id", pacienteId)
    .is("excluido_em", null)
    .gte("inicio", new Date().toISOString())
    .limit(5000);
  if (error) throw new Error("Não foi possível carregar os atendimentos.");
  const contagem = new Map<string, FuturosPorProfissional>();
  for (const a of data) {
    for (const { profissional: p } of a.profissionais) {
      if (profissional && p.id !== eu?.profissionalId) continue;
      const atual = contagem.get(p.id) ?? { id: p.id, nome: p.nome, quantidade: 0 };
      atual.quantidade += 1;
      contagem.set(p.id, atual);
    }
  }
  return [...contagem.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Recepção e ADM: exclui os atendimentos de agora em diante, de todos ou dos profissionais escolhidos. */
export async function excluirFuturos(pacienteId: string, profissionais: string[] | null, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "A exclusão exige uma observação." };
  if (profissionais && profissionais.length === 0) return { ok: false, erro: "Escolha ao menos um profissional." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("excluir_futuros_do_paciente", { p_paciente: pacienteId, p_profissionais: profissionais as string[], p_motivo: motivo.trim() });
  if (!error) revalidar(pacienteId);
  return concluir(error, data, "Não foi possível excluir os atendimentos.");
}

/**
 * Profissional: exclui os atendimentos dele com o paciente de agora em diante, e o paciente
 * sai da lista dele até alguém marcar um atendimento entre os dois. A equipe é avisada.
 */
export async function ocultarPaciente(pacienteId: string, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "Informe o motivo." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ocultar_paciente", { p_paciente: pacienteId, p_motivo: motivo.trim() });
  if (!error) revalidar(pacienteId);
  return concluir(error, data, "Não foi possível ocultar o paciente.");
}
