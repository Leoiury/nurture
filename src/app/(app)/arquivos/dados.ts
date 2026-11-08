import "server-only";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

export type ArquivoDoPaciente = {
  id: string;
  nome: string;
  tipoMime: string;
  tamanho: number;
  enviadoEm: string;
  enviadoPor: string;
  atendimentoId: string | null;
  anamneseId: string | null;
  podeExcluir: boolean;
};

/** Os arquivos que este login pode ver, do mais novo para o mais antigo. Quem decide é o banco: quem enviou, quem atendeu ou ADM. */
export async function carregarArquivos(pacienteId: string): Promise<ArquivoDoPaciente[]> {
  const [supabase, eu] = await Promise.all([createClient(), usuarioAtual()]);
  const { data, error } = await supabase
    .from("arquivos_paciente")
    .select("id, nome, tipo_mime, tamanho, enviado_em, enviado_por, enviado_por_nome, atendimento_id, anamnese_id")
    .eq("paciente_id", pacienteId)
    .order("enviado_em", { ascending: false });
  if (error) throw new Error("Não foi possível carregar os arquivos.");
  return data.map((a) => ({
    id: a.id,
    nome: a.nome,
    tipoMime: a.tipo_mime,
    tamanho: a.tamanho,
    enviadoEm: a.enviado_em,
    enviadoPor: a.enviado_por_nome,
    atendimentoId: a.atendimento_id,
    anamneseId: a.anamnese_id,
    podeExcluir: a.enviado_por === eu?.id || eu?.perfil === "adm",
  }));
}
