"use server";

// Inativação pedida pelo profissional e exclusão dos atendimentos futuros do paciente.

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
  revalidatePath("/solicitacoes");
}

/** Mensagem do banco quando é uma regra nossa; senão, a genérica. */
function concluir(error: { message: string; code?: string } | null, quantidade: number | null, generica: string): Resultado {
  if (!error) return { ok: true, quantidade: quantidade ?? 0 };
  return { ok: false, erro: error.code === "P0001" ? error.message : generica };
}

/**
 * Atendimentos de agora em diante, por profissional. O profissional só conta os dele
 * ainda sem pedido de exclusão; recepção e ADM veem todos.
 */
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

/** Profissional: o paciente sai da lista dele, e os atendimentos futuros dele entram no fluxo de exclusão. */
export async function pedirInativacao(pacienteId: string, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "Informe o motivo da inativação." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pedir_inativacao", { p_paciente: pacienteId, p_motivo: motivo.trim() });
  if (!error) revalidar(pacienteId);
  return concluir(error, data, "Não foi possível pedir a inativação.");
}

/** Profissional: volta a ver o paciente e, se ele estiver inativo, o reativa. */
export async function reativarParaMim(pacienteId: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reativar_paciente_para_mim", { p_paciente: pacienteId });
  if (!error) revalidar(pacienteId);
  return concluir(error, 0, "Não foi possível reativar o paciente.");
}

export type Decisao = "inativar" | "manter" | "recusar";

/** Recepção ou ADM decide o pedido de inativação de um profissional. */
export async function decidirInativacao(pedidoId: string, pacienteId: string, decisao: Decisao): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decidir_inativacao", { p_id: pedidoId, p_decisao: decisao });
  if (!error) revalidar(pacienteId);
  return concluir(error, data, "Não foi possível registrar a decisão.");
}

/**
 * Exclui os atendimentos de agora em diante. Recepção e ADM excluem direto, de todos ou
 * dos profissionais escolhidos; o profissional só pede a exclusão dos dele.
 */
export async function excluirFuturos(pacienteId: string, profissionais: string[] | null, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, erro: "A exclusão exige uma observação." };
  if (profissionais && profissionais.length === 0) return { ok: false, erro: "Escolha ao menos um profissional." };
  const supabase = await createClient();
  const { data, error } = (await ehProfissional())
    ? await supabase.rpc("pedir_exclusao_dos_futuros", { p_paciente: pacienteId, p_motivo: motivo.trim() })
    : await supabase.rpc("excluir_futuros_do_paciente", { p_paciente: pacienteId, p_profissionais: profissionais as string[], p_motivo: motivo.trim() });
  if (!error) revalidar(pacienteId);
  return concluir(error, data, "Não foi possível excluir os atendimentos.");
}
