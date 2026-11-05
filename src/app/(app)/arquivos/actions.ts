"use server";

import { revalidatePath } from "next/cache";
import { podeVerClinico } from "@/lib/auth/usuario";
import { mimeDoArquivo } from "@/lib/arquivos";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

function revalidar(pacienteId: string, atendimentoId: string | null) {
  revalidatePath(`/pacientes/${pacienteId}`);
  if (atendimentoId) revalidatePath(`/atendimento/${atendimentoId}`);
}

/** Depois do envio direto ao Storage: o arquivo passa a existir para a clínica. */
export async function registrarArquivo(pacienteId: string, atendimentoId: string | null, nome: string, caminho: string): Promise<Resultado> {
  if (!(await podeVerClinico())) return { ok: false, erro: "Sem permissão para enviar arquivos." };
  if (!mimeDoArquivo(nome)) return { ok: false, erro: "Envie apenas PDF ou Word." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_arquivo", { p_paciente: pacienteId, p_atendimento: atendimentoId as string, p_nome: nome, p_caminho: caminho });
  if (error) return { ok: false, erro: "O arquivo foi enviado, mas não foi possível registrá-lo. Tente de novo." };
  revalidar(pacienteId, atendimentoId);
  return { ok: true };
}

export async function excluirArquivo(id: string, pacienteId: string, atendimentoId: string | null): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_arquivo", { p_id: id });
  if (error) return { ok: false, erro: "Só quem enviou ou um administrador exclui o arquivo." };
  revalidar(pacienteId, atendimentoId);
  return { ok: true };
}
