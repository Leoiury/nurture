"use server";

import { revalidatePath } from "next/cache";
import { NOMES_DOS_DIAS, problemaNoDia, type Escala } from "@/lib/agenda/escala";
import { formatarHora } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";

export type DadosDoProfissional = {
  id?: string; // ausente: novo profissional
  nome: string;
  especialidade: string;
  registro: string;
  celular: string;
  email: string;
  ativo: boolean;
};

export type ResultadoProfissional = { ok: true; id: string } | { ok: false; erro: string };

export async function salvarProfissional(p: DadosDoProfissional): Promise<ResultadoProfissional> {
  const nome = p.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 3) return { ok: false, erro: "Informe o nome." };
  const email = p.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "E-mail inválido." };

  const vazioComoNulo = (v: string) => v.trim() || null;
  const dados = {
    nome,
    especialidade: vazioComoNulo(p.especialidade),
    registro: vazioComoNulo(p.registro),
    celular: vazioComoNulo(p.celular),
    email: email || null,
    ativo: p.ativo,
  };
  const supabase = await createClient();
  const { data, error } = p.id
    ? await supabase.from("profissionais").update(dados).eq("id", p.id).select("id").single()
    : await supabase.from("profissionais").insert(dados).select("id").single();
  if (error) return { ok: false, erro: error.code === "23505" ? "Já existe um profissional com esse nome." : "Não foi possível salvar." };

  revalidatePath("/profissionais", "layout");
  revalidatePath("/agenda");
  return { ok: true, id: data.id };
}

/** Troca a escala semanal (vazia: sem escala própria, vale o expediente padrão). */
export async function salvarEscala(profissionalId: string, escala: Escala): Promise<{ ok: true } | { ok: false; erro: string }> {
  const intervalos: { dia_semana: number; hora_inicio: string; hora_fim: string }[] = [];
  for (const [dia, lista] of Object.entries(escala)) {
    if (!lista?.length) continue;
    const problema = problemaNoDia(lista);
    if (problema) return { ok: false, erro: `${NOMES_DOS_DIAS[Number(dia)]}: ${problema}` };
    for (const i of lista) intervalos.push({ dia_semana: Number(dia), hora_inicio: formatarHora(i.inicio), hora_fim: formatarHora(i.fim) });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_escala", { p_profissional: profissionalId, p_intervalos: intervalos });
  if (error) return { ok: false, erro: `Não foi possível salvar a escala: ${error.message}` };
  revalidatePath("/profissionais", "layout");
  return { ok: true };
}
