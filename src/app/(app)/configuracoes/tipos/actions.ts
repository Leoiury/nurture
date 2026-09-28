"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

export type DadosDoTipo = {
  id?: string; // ausente: novo tipo
  nome: string;
  ativo: boolean;
  /** Quem atende; vazio = qualquer profissional. */
  profissionais: string[];
};

function revalidar() {
  revalidatePath("/configuracoes/tipos");
  revalidatePath("/agenda");
}

export async function salvarTipo(t: DadosDoTipo): Promise<Resultado> {
  const nome = t.nome.trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome." };

  const supabase = await createClient();
  const dados = { nome, ativo: t.ativo };
  const { data, error } = t.id
    ? await supabase.from("tipos_atendimento").update(dados).eq("id", t.id).select("id").single()
    : await supabase.from("tipos_atendimento").insert(dados).select("id").single();
  if (error) return { ok: false, erro: error.code === "23505" ? "Já existe um tipo com esse nome." : "Não foi possível salvar." };

  // Vínculos: remove os que saíram e garante os escolhidos (sem apagar tudo antes).
  const semOsEscolhidos = supabase.from("tipos_atendimento_profissionais").delete().eq("tipo_id", data.id);
  const removidos = t.profissionais.length ? await semOsEscolhidos.not("profissional_id", "in", `(${t.profissionais.join(",")})`) : await semOsEscolhidos;
  const incluidos = t.profissionais.length
    ? await supabase
        .from("tipos_atendimento_profissionais")
        .upsert(t.profissionais.map((profissional_id) => ({ tipo_id: data.id, profissional_id })), { ignoreDuplicates: true })
    : { error: null };
  if (removidos.error || incluidos.error) return { ok: false, erro: "O tipo foi salvo, mas não foi possível atualizar quem atende." };

  revalidar();
  return { ok: true };
}

/** Só tipos sem uso podem ser excluídos; os em uso são desativados (o histórico continua certo). */
export async function excluirTipo(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { count } = await supabase.from("atendimentos").select("id", { count: "exact", head: true }).eq("tipo_id", id);
  if ((count ?? 0) > 0) return { ok: false, erro: "Tipo em uso: desative em vez de excluir." };
  const { error } = await supabase.from("tipos_atendimento").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidar();
  return { ok: true };
}
