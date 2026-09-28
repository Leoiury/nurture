"use server";

import { revalidatePath } from "next/cache";
import { PALETA_PLANOS } from "@/lib/agenda/cores";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

export type DadosDoPlano = {
  id?: string; // ausente: novo plano
  nome: string;
  cor: string;
  duracaoMin: number;
  valor: number | null;
  ativo: boolean;
};

function revalidar() {
  revalidatePath("/configuracoes/planos");
  revalidatePath("/agenda");
}

export async function salvarPlano(p: DadosDoPlano): Promise<Resultado> {
  const nome = p.nome.trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome." };
  if (!PALETA_PLANOS.some((c) => c.hex.toLowerCase() === p.cor.toLowerCase())) return { ok: false, erro: "Escolha uma cor da paleta." };
  if (!(Number.isInteger(p.duracaoMin) && p.duracaoMin >= 5 && p.duracaoMin <= 720)) return { ok: false, erro: "Duração inválida." };
  if (p.valor !== null && !(p.valor >= 0)) return { ok: false, erro: "Valor inválido." };

  const supabase = await createClient();
  const dados = { nome, cor: p.cor, duracao_padrao_min: p.duracaoMin, valor_padrao: p.valor, ativo: p.ativo };
  const { error } = p.id ? await supabase.from("planos").update(dados).eq("id", p.id) : await supabase.from("planos").insert(dados);
  if (error) return { ok: false, erro: error.code === "23505" ? "Já existe um plano com esse nome." : "Não foi possível salvar." };
  revalidar();
  return { ok: true };
}

/** Só planos sem uso podem ser excluídos; os em uso são desativados (o histórico continua certo). */
export async function excluirPlano(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const [atendimentos, pacientes] = await Promise.all([
    supabase.from("atendimentos").select("id", { count: "exact", head: true }).eq("plano_id", id),
    supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("plano_id", id),
  ]);
  if ((atendimentos.count ?? 0) + (pacientes.count ?? 0) > 0) return { ok: false, erro: "Plano em uso: desative em vez de excluir." };
  const { error } = await supabase.from("planos").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidar();
  return { ok: true };
}
