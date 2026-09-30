"use server";

import { revalidatePath } from "next/cache";
import { ehAdm } from "@/lib/auth/usuario";
import { dataNoAno } from "@/lib/agenda/lembretes";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

/** dia -1 = último dia do mês; pascoa = dias em relação ao domingo de Páscoa (Carnaval = -47). */
export type NovaData = { nome: string; descricao: string } & (
  | { tipo: "fixa"; dia: number; mes: number }
  | { tipo: "movel"; ordem: number; diaSemana: number; mes: number }
  | { tipo: "pascoa"; dias: number }
);

type Linha = { nome: string; descricao: string | null; mes: number | null; dia: number | null; ordem: number | null; dia_semana: number | null; pascoa: number | null };

export async function criarData(d: NovaData): Promise<Resultado> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores alteram as datas." };
  const nome = d.nome.trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome." };
  const base = { nome, descricao: d.descricao.trim() || null, mes: null, dia: null, ordem: null, dia_semana: null, pascoa: null };
  let linha: Linha;
  if (d.tipo === "pascoa") {
    if (!(Number.isInteger(d.dias) && Math.abs(d.dias) <= 100)) return { ok: false, erro: "Informe de -100 a 100 dias." };
    linha = { ...base, pascoa: d.dias };
  } else {
    if (!(d.mes >= 1 && d.mes <= 12)) return { ok: false, erro: "Mês inválido." };
    linha = d.tipo === "fixa" ? { ...base, mes: d.mes, dia: d.dia } : { ...base, mes: d.mes, ordem: d.ordem, dia_semana: d.diaSemana };
    // 29/02 existe em ano bissexto (2028); 31/04 não existe nunca.
    if (d.tipo === "fixa" && !dataNoAno(linha, 2028)) return { ok: false, erro: "Esse dia não existe nesse mês." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("datas_comemorativas").insert(linha);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  revalidatePath("/configuracoes/datas");
  revalidatePath("/agenda");
  return { ok: true };
}

export async function excluirData(id: string): Promise<Resultado> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores alteram as datas." };
  const supabase = await createClient();
  const { error } = await supabase.from("datas_comemorativas").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidatePath("/configuracoes/datas");
  revalidatePath("/agenda");
  return { ok: true };
}
