"use server";

import { revalidatePath } from "next/cache";
import { NOMES_DOS_DIAS, problemaNoDia, type Escala } from "@/lib/agenda/escala";
import { formatarHora } from "@/lib/agenda/tempo";
import { partesNoFuso } from "@/lib/agenda/tempo";
import { ehAdm } from "@/lib/auth/usuario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DadosDoProfissional = {
  id?: string; // ausente: novo profissional
  nome: string;
  especialidade: string;
  registro: string;
  celular: string;
  email: string;
};

export type ResultadoProfissional = { ok: true; id: string } | { ok: false; erro: string };

export async function salvarProfissional(p: DadosDoProfissional): Promise<ResultadoProfissional> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores alteram profissionais." };
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

export type AtendimentoParaRevisar = { id: string; inicio: string; data: string; paciente: string };

/** Atendimentos marcados ou confirmados daqui para a frente: somem da agenda se o profissional sair dela. */
export async function atendimentosParaRevisar(id: string): Promise<{ ok: true; total: number; lista: AtendimentoParaRevisar[] } | { ok: false; erro: string }> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores inativam profissionais." };
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("atendimentos")
    .select("id, inicio, paciente:pacientes(nome), vinculo:atendimento_profissionais!inner(profissional_id)", { count: "exact" })
    .eq("vinculo.profissional_id", id)
    .is("excluido_em", null)
    .in("status", ["marcado", "confirmado"])
    .gte("inicio", new Date().toISOString())
    .order("inicio")
    .limit(50);
  if (error) return { ok: false, erro: "Não foi possível consultar os atendimentos." };
  return { ok: true, total: count ?? data.length, lista: data.map((a) => ({ id: a.id, inicio: a.inicio, data: partesNoFuso(a.inicio).data, paciente: a.paciente?.nome ?? "Sem paciente" })) };
}

/** Login bloqueado enquanto o usuário estiver inativo (~100 anos). */
const BLOQUEIO = "876000h";

export type ResultadoDaInativacao = { ok: true; loginsBloqueados: number; loginsMantidos: number } | { ok: false; erro: string; mudou?: boolean };

/**
 * Tira o profissional da agenda, bloqueia o login de perfil profissional e cancela os links
 * pendentes. Login de ADM vinculado continua: ele tem outras funções. `totalVisto` é a
 * quantidade do aviso: se mudou nesse meio-tempo, nada acontece e o aviso é refeito.
 */
export async function inativarProfissional(id: string, totalVisto: number): Promise<ResultadoDaInativacao> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores inativam profissionais." };
  const revisar = await atendimentosParaRevisar(id);
  if (!revisar.ok) return revisar;
  if (revisar.total !== totalVisto) return { ok: false, mudou: true, erro: "A quantidade de atendimentos mudou. Confira de novo." };

  const supabase = await createClient();
  const { error } = await supabase.from("profissionais").update({ ativo: false }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível inativar." };

  const admin = createAdminClient();
  const { error: erroLinks } = await admin.from("convites").update({ revogado_em: new Date().toISOString() }).eq("profissional_id", id).is("usado_em", null).is("revogado_em", null);
  const { data: logins, error: erroLogins } = await admin.from("usuarios").select("id, perfil").eq("profissional_id", id).eq("ativo", true);
  if (erroLinks || erroLogins) return { ok: false, erro: "Inativado, mas não foi possível bloquear o acesso. Confira em Configurações → Usuários." };
  const aBloquear = logins.filter((l) => l.perfil === "profissional");
  for (const login of aBloquear) {
    const { error: e1 } = await admin.from("usuarios").update({ ativo: false }).eq("id", login.id);
    const { error: e2 } = await admin.auth.admin.updateUserById(login.id, { ban_duration: BLOQUEIO });
    if (e1 || e2) return { ok: false, erro: "Inativado, mas não foi possível bloquear o login. Confira em Configurações → Usuários." };
  }

  revalidatePath("/profissionais", "layout");
  revalidatePath("/agenda");
  revalidatePath("/configuracoes/usuarios");
  return { ok: true, loginsBloqueados: aBloquear.length, loginsMantidos: logins.length - aBloquear.length };
}

/** Volta à agenda. O login continua bloqueado: um ADM libera em Configurações → Usuários. */
export async function reativarProfissional(id: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores reativam profissionais." };
  const supabase = await createClient();
  const { error } = await supabase.from("profissionais").update({ ativo: true }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível reativar." };
  revalidatePath("/profissionais", "layout");
  revalidatePath("/agenda");
  return { ok: true };
}

/** Troca a escala semanal (vazia: sem escala própria, vale o expediente padrão). */
export async function salvarEscala(profissionalId: string, escala: Escala): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!(await ehAdm())) return { ok: false, erro: "Apenas administradores alteram a escala." };
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
