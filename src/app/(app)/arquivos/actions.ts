"use server";

import { revalidatePath } from "next/cache";
import { podeVerClinico } from "@/lib/auth/usuario";
import { mimeDoArquivo } from "@/lib/arquivos";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

/** Onde o arquivo foi enviado, além da ficha do paciente. */
export type Origem = { atendimentoId?: string | null; anamneseId?: string | null };

function revalidar(pacienteId: string, { atendimentoId, anamneseId }: Origem) {
  revalidatePath(`/pacientes/${pacienteId}`);
  if (atendimentoId) revalidatePath(`/atendimento/${atendimentoId}`);
  if (anamneseId) revalidatePath(`/anamnese/${anamneseId}`);
}

/** Depois do envio direto ao Storage: o arquivo passa a existir para a clínica. */
export async function registrarArquivo(pacienteId: string, origem: Origem, nome: string, caminho: string): Promise<Resultado> {
  if (!(await podeVerClinico())) return { ok: false, erro: "Sem permissão para enviar arquivos." };
  if (!mimeDoArquivo(nome)) return { ok: false, erro: "Envie apenas PDF, Word ou imagem." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_arquivo", {
    p_paciente: pacienteId,
    p_atendimento: (origem.atendimentoId ?? null) as string,
    p_anamnese: (origem.anamneseId ?? null) as string,
    p_nome: nome,
    p_caminho: caminho,
  });
  if (error) return { ok: false, erro: "O arquivo foi enviado, mas não foi possível registrá-lo. Tente de novo." };
  revalidar(pacienteId, origem);
  return { ok: true };
}

export async function excluirArquivo(id: string, pacienteId: string, origem: Origem): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_arquivo", { p_id: id });
  if (error) return { ok: false, erro: "Só quem enviou ou um administrador exclui o arquivo." };
  revalidar(pacienteId, origem);
  return { ok: true };
}
