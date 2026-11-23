"use server";

// Guias de autorização do convênio como saldo do paciente: um controle (plano,
// profissionais e marco zero) soma as guias recebidas, e gastam sessão os atendimentos
// do paciente no plano, com um dos profissionais, desde o marco zero. A cobertura é
// calculada no banco (guias_dos_atendimentos). Gerar, renovar e editar: só recepção e ADM.

import { revalidatePath } from "next/cache";
import { ATENDIMENTOS_SEM_VALOR } from "@/lib/agenda/sem-valor";
import { instanteNoFuso } from "@/lib/agenda/tempo";
import { ehProfissional } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true } | { ok: false; erro: string };

export type UsoDoProfissional = { id: string; nome: string; usadas: number; agendadas: number };

export type ControleDeGuia = {
  id: string;
  planoId: string | null;
  /** Nulo: qualquer plano. */
  plano: string | null;
  marcoZero: string;
  profissionais: UsoDoProfissional[];
  guias: { id: string; numero: string | null; quantidade: number; ordem: number }[];
  total: number;
  /** Sessões de atendimentos que já passaram. */
  usadas: number;
  /** Sessões reservadas por atendimentos marcados daqui em diante. */
  agendadas: number;
};

/** Os controles de guia do paciente, com o uso de cada profissional. */
export async function guiasDoPaciente(pacienteId: string): Promise<ControleDeGuia[]> {
  const [supabase, profissional] = await Promise.all([createClient(), ehProfissional()]);
  const { data: controles, error } = await supabase
    .from("controles_de_guia")
    .select("id, plano_id, marco_zero, profissionais:controles_de_guia_profissionais(profissional:profissionais(id, nome)), guias(id, numero, quantidade, ordem)")
    .eq("paciente_id", pacienteId)
    .order("marco_zero");
  if (error) throw new Error("Não foi possível carregar as guias.");
  if (controles.length === 0) return [];

  const [usos, planos] = await Promise.all([
    supabase
      .from("atendimentos_dos_controles")
      .select("controle_id, profissional_id, inicio")
      .in(
        "controle_id",
        controles.map((c) => c.id),
      )
      .limit(10000),
    supabase.from((profissional ? "planos_equipe" : "planos") as "planos").select("id, nome"),
  ]);
  if (usos.error || planos.error) throw new Error("Não foi possível carregar as guias.");

  const agora = Date.now();
  const nomeDoPlano = new Map(planos.data.map((p) => [p.id, p.nome]));
  return controles.map((c) => {
    const profissionais = new Map<string, UsoDoProfissional>(
      c.profissionais.map(({ profissional: p }) => [p.id, { id: p.id, nome: p.nome, usadas: 0, agendadas: 0 }]),
    );
    let usadas = 0;
    let agendadas = 0;
    for (const u of usos.data) {
      if (u.controle_id !== c.id) continue;
      const passou = new Date(u.inicio!).getTime() < agora;
      if (passou) usadas += 1;
      else agendadas += 1;
      const p = profissionais.get(u.profissional_id!);
      if (p) p[passou ? "usadas" : "agendadas"] += 1;
    }
    const guias = [...c.guias].sort((a, b) => a.ordem - b.ordem);
    return {
      id: c.id,
      planoId: c.plano_id,
      plano: c.plano_id ? (nomeDoPlano.get(c.plano_id) ?? "Plano") : null,
      marcoZero: c.marco_zero,
      profissionais: [...profissionais.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      guias,
      total: guias.reduce((s, g) => s + g.quantidade, 0),
      usadas,
      agendadas,
    };
  });
}

/** Guia do atendimento: a sessão que ele gasta, o controle dele e o que dá para fazer. */
export async function guiaDoAtendimento(id: string) {
  const supabase = await createClient();
  const { data: a, error } = await supabase
    .from(ATENDIMENTOS_SEM_VALOR)
    .select(
      "id, inicio, status, paciente_id, plano_id, plano:planos_equipe(exige_guia), profissionais:atendimento_profissionais(profissional_id)" as "id, inicio, status, paciente_id, plano_id, plano:planos(exige_guia), profissionais:atendimento_profissionais(profissional_id)",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error("Atendimento não encontrado.");

  const [cobertura, controles, profissional] = await Promise.all([
    supabase.from("guias_dos_atendimentos").select("controle_id, numero, ordem, posicao, quantidade, renovada, sessao, total").eq("atendimento_id", id).maybeSingle(),
    a.paciente_id ? guiasDoPaciente(a.paciente_id) : Promise.resolve([]),
    ehProfissional(),
  ]);
  if (cobertura.error) throw new Error("Não foi possível carregar a guia.");

  const meus = new Set(a.profissionais.map((p) => p.profissional_id));
  const atual = cobertura.data;
  // O controle deste atendimento: o que o cobre ou, sem cobertura, o do mesmo profissional e plano.
  const controle =
    controles.find((c) => c.id === atual?.controle_id) ??
    controles.find((c) => (c.planoId === null || c.planoId === a.plano_id) && c.profissionais.some((p) => meus.has(p.id))) ??
    null;
  return {
    exigeGuia: a.plano?.exige_guia ?? false,
    atual: atual && {
      numero: atual.numero,
      ordem: atual.ordem!,
      posicao: atual.posicao!,
      quantidade: atual.quantidade!,
      renovada: atual.renovada!,
      sessao: atual.sessao!,
      total: atual.total!,
    },
    controle,
    /** O profissional vê a situação da guia; gerar, renovar e editar ficam com a recepção e o ADM. */
    podeEditar: !profissional && a.status !== "desmarcado",
    /** Sugestão para uma guia nova a partir deste atendimento. */
    sugestao: { pacienteId: a.paciente_id, planoId: a.plano_id, profissionais: [...meus], marcoZero: a.inicio },
  };
}

export type GuiaDoAtendimento = Awaited<ReturnType<typeof guiaDoAtendimento>>;

/** Profissionais e planos que podem entrar numa guia. */
export async function opcoesDaGuia() {
  const supabase = await createClient();
  const [profissionais, planos] = await Promise.all([
    supabase.from("profissionais").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("planos").select("id, nome, ativo, exige_guia").order("nome"),
  ]);
  if (profissionais.error || planos.error) throw new Error("Não foi possível carregar as opções.");
  return { profissionais: profissionais.data, planos: planos.data };
}

export type OpcoesDaGuia = Awaited<ReturnType<typeof opcoesDaGuia>>;

export type DadosDaGuia = {
  planoId: string | null;
  profissionais: string[];
  /** Data (AAAA-MM-DD): os atendimentos a partir dela gastam sessão. */
  marcoZero: string;
};

function validar(d: DadosDaGuia): string | null {
  if (d.profissionais.length === 0) return "Escolha ao menos um profissional.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.marcoZero)) return "Informe a data do marco zero.";
  return null;
}

function quantidadeInvalida(quantidade: number) {
  return !(Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 500);
}

function concluir(error: { message: string; code?: string } | null): Resultado {
  if (error) return { ok: false, erro: error.code === "P0001" ? error.message : error.code === "42501" ? "Sem permissão para alterar guias." : "Não foi possível salvar a guia." };
  revalidatePath("/agenda");
  revalidatePath("/pacientes", "layout");
  revalidatePath("/notificacoes");
  return { ok: true };
}

export async function criarGuia(pacienteId: string, dados: DadosDaGuia, numero: string, quantidade: number): Promise<Resultado> {
  const invalido = validar(dados) ?? (quantidadeInvalida(quantidade) ? "A guia deve ter de 1 a 500 sessões." : null);
  if (invalido) return { ok: false, erro: invalido };
  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_guia", {
    p_paciente: pacienteId,
    p_plano: dados.planoId as string,
    p_profissionais: dados.profissionais,
    p_marco_zero: instanteNoFuso(dados.marcoZero, "00:00"),
    p_numero: numero.trim(),
    p_quantidade: quantidade,
  });
  return concluir(error);
}

/** Mais uma guia no saldo do controle. */
export async function renovarGuia(controleId: string, numero: string, quantidade: number): Promise<Resultado> {
  if (quantidadeInvalida(quantidade)) return { ok: false, erro: "A guia deve ter de 1 a 500 sessões." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("renovar_guia", { p_controle: controleId, p_numero: numero.trim(), p_quantidade: quantidade });
  return concluir(error);
}

export async function editarGuia(controleId: string, dados: DadosDaGuia): Promise<Resultado> {
  const invalido = validar(dados);
  if (invalido) return { ok: false, erro: invalido };
  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_guia", {
    p_controle: controleId,
    p_plano: dados.planoId as string,
    p_profissionais: dados.profissionais,
    p_marco_zero: instanteNoFuso(dados.marcoZero, "00:00"),
  });
  return concluir(error);
}

/** Exclui a última guia do controle (desfaz um engano). */
export async function excluirGuia(guiaId: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_guia", { p_guia: guiaId });
  return concluir(error);
}
