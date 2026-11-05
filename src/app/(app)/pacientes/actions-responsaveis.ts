"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DadosDoResponsavel = {
  id?: string; // ausente: novo responsável, já vinculado ao paciente
  pacienteId: string;
  nome: string;
  cpf: string;
  email: string;
  whatsapp: string;
};

export type ResponsavelEncontrado = { id: string; nome: string; cpf: string | null };

type Resultado = { ok: true } | { ok: false; erro: string };

function revalidar(pacienteId: string) {
  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/pacientes");
}

export async function salvarResponsavel(r: DadosDoResponsavel): Promise<Resultado> {
  const nome = r.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 3) return { ok: false, erro: "Informe o nome completo." };
  const cpf = r.cpf.replace(/\D/g, "");
  if (cpf && cpf.length !== 11) return { ok: false, erro: "O CPF deve ter 11 dígitos." };
  const email = r.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "E-mail inválido." };
  const whatsapp = r.whatsapp.trim();
  if (whatsapp && whatsapp.replace(/\D/g, "").length < 10) return { ok: false, erro: "Confira o WhatsApp, com DDD." };

  const supabase = await createClient();
  const { error } = r.id
    ? await supabase.from("responsaveis").update({ nome, cpf: cpf || null, email: email || null, whatsapp: whatsapp || null }).eq("id", r.id)
    : await supabase.rpc("criar_responsavel_do_paciente", { p_paciente: r.pacienteId, p_nome: nome, p_cpf: cpf, p_email: email, p_whatsapp: whatsapp });
  if (error) return { ok: false, erro: error.code === "23505" ? "Já existe um responsável com esse CPF. Busque por ele para vincular." : "Não foi possível salvar." };
  revalidar(r.pacienteId);
  return { ok: true };
}

/** Busca por nome ou CPF quem ainda não é responsável por este paciente. */
export async function buscarResponsaveis(termo: string, pacienteId: string): Promise<ResponsavelEncontrado[]> {
  const texto = termo.trim().replace(/[%_,()*\\]/g, "");
  if (texto.length < 2) return [];
  const digitos = texto.replace(/\D/g, "");
  const supabase = await createClient();
  const consulta = supabase.from("responsaveis").select("id, nome, cpf, vinculos:paciente_responsaveis(paciente_id)").order("nome").limit(20);
  const { data, error } = await (digitos.length >= 3 ? consulta.or(`nome.ilike.%${texto}%,cpf.like.%${digitos}%`) : consulta.ilike("nome", `%${texto}%`));
  if (error) throw new Error("Não foi possível buscar os responsáveis.");
  return data.filter((r) => !r.vinculos.some((v) => v.paciente_id === pacienteId)).slice(0, 8).map((r) => ({ id: r.id, nome: r.nome, cpf: r.cpf }));
}

export async function vincularResponsavel(pacienteId: string, responsavelId: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("paciente_responsaveis").upsert({ paciente_id: pacienteId, responsavel_id: responsavelId }, { ignoreDuplicates: true });
  if (error) return { ok: false, erro: "Não foi possível vincular." };
  revalidar(pacienteId);
  return { ok: true };
}

export async function desvincularResponsavel(pacienteId: string, responsavelId: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("desvincular_responsavel", { p_paciente: pacienteId, p_responsavel: responsavelId });
  if (error) return { ok: false, erro: "Não foi possível remover." };
  revalidar(pacienteId);
  return { ok: true };
}
