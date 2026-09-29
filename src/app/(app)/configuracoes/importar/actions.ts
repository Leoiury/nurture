"use server";

// Importação da agenda do sistema anterior (Configurações → Importar agenda).
// Só ADMs (o banco confere em importar_agenda_legado e nas tabelas).
//
// 1. analisar: lê o arquivo, casa com o que existe no app e simula no banco
//    (sem gravar) quantos atendimentos seriam novos, atualizados, iguais,
//    mantidos (modificados no app) e excluídos, por mês.
// 2. importar: cria o que falta (pacientes, tipos, profissionais escolhidos como
//    novos), guarda as correspondências escolhidas e aplica os meses marcados.

import { revalidatePath } from "next/cache";
import { instanteNoFuso } from "@/lib/agenda/tempo";
import { valorSugerido } from "@/lib/agenda/valores";
import { ArquivoInvalido, capitalizar, chave, chaveCompacta, lerAgendaLegado, type LinhaLegado } from "@/lib/importacao/agenda-legado";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Correspondências escolhidas na tela para o que o app não reconheceu. */
export type Escolhas = {
  /** chave compacta do convênio → id do plano ("" = sem plano). */
  convenios: Record<string, string>;
  /** chave do nome do profissional → id do profissional, ou "novo". */
  profissionais: Record<string, string>;
};

export type Acao = "novos" | "atualizados" | "iguais" | "mantidos" | "excluidos" | "ignorados";

export type ResumoDoMes = { mes: string; linhas: number; validas: number; contagens: Partial<Record<Acao, number>> | null };

export type Analise = {
  ok: true;
  meses: ResumoDoMes[];
  pendencias: { convenios: { chave: string; nome: string; quantidade: number }[]; profissionais: { chave: string; nome: string; quantidade: number }[] };
  pacientesNovos: number;
  tiposNovos: string[];
  opcoes: { planos: { id: string; nome: string }[]; profissionais: { id: string; nome: string }[] };
};

export type Falha = { ok: false; erro: string };

const CONVENIO_REUNIOES = chaveCompacta("Reuniões e Visitas");
const TIPO_REUNIOES = "Reuniões e Visitas";
const DURACAO_SEM_PLANO = 45;

async function ehAdm(supabase: Supabase): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const perfil = (data?.claims.app_metadata as { perfil?: string } | undefined)?.perfil;
  return perfil === "direcao" || perfil === "dev";
}

async function lerArquivo(dados: FormData): Promise<LinhaLegado[]> {
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new ArquivoInvalido("Escolha o arquivo do relatório.");
  return lerAgendaLegado(await arquivo.arrayBuffer());
}

function lerEscolhas(dados: FormData): Escolhas {
  try {
    const e = JSON.parse(String(dados.get("escolhas") ?? "{}"));
    return { convenios: e.convenios ?? {}, profissionais: e.profissionais ?? {} };
  } catch {
    return { convenios: {}, profissionais: {} };
  }
}

/** Casa as linhas do arquivo com planos, profissionais, tipos e pacientes do app. */
async function resolver(supabase: Supabase, linhas: LinhaLegado[], escolhas: Escolhas) {
  const idsPacientes = [...new Set(linhas.map((l) => l.pacienteIdLegado).filter((id): id is number => id !== null))];
  const [planos, mapeados, profissionais, tipos, pacientes] = await Promise.all([
    supabase.from("planos").select("id, nome, duracao_padrao_min, valor_padrao, valor_fonoaudiologia, valor_psicologia, valor_nutricao, valor_psicopedagogia"),
    supabase.from("convenios_legado").select("nome, plano_id"),
    supabase.from("profissionais").select("id, nome, nome_legado, ativo"),
    supabase.from("tipos_atendimento").select("id, nome, area"),
    idsPacientes.length ? supabase.from("pacientes").select("id, id_legado").in("id_legado", idsPacientes) : { data: [], error: null },
  ]);
  for (const r of [planos, mapeados, profissionais, tipos, pacientes]) if (r.error) throw new Error("Não foi possível ler os dados do app.");

  // Convênio → plano: correspondência guardada, escolhida agora, ou nome igual.
  const planoPorChave = new Map(planos.data!.map((p) => [chaveCompacta(p.nome), p]));
  const planoPorId = new Map(planos.data!.map((p) => [p.id, p]));
  const guardados = new Map(mapeados.data!.map((m) => [m.nome, m.plano_id]));
  const convenioPendente = new Map<string, { nome: string; quantidade: number }>();
  type Plano = NonNullable<typeof planos.data>[number];
  const planoDo = (convenio: string): { reuniao: boolean; plano: Plano | null; pendente: boolean } => {
    const k = chaveCompacta(convenio);
    if (!k) return { reuniao: false, plano: null, pendente: false };
    if (k === CONVENIO_REUNIOES) return { reuniao: true, plano: null, pendente: false };
    if (k in escolhas.convenios) return { reuniao: false, plano: planoPorId.get(escolhas.convenios[k]) ?? null, pendente: false };
    if (guardados.has(k)) return { reuniao: false, plano: planoPorId.get(guardados.get(k) ?? "") ?? null, pendente: false };
    const plano = planoPorChave.get(k);
    if (plano) return { reuniao: false, plano, pendente: false };
    const p = convenioPendente.get(k) ?? { nome: convenio, quantidade: 0 };
    convenioPendente.set(k, { ...p, quantidade: p.quantidade + 1 });
    return { reuniao: false, plano: null, pendente: true };
  };

  // Profissional: pelo nome no sistema anterior, pelo nome, ou escolhido agora.
  const profPorChave = new Map<string, string>();
  for (const p of profissionais.data!) {
    profPorChave.set(chave(p.nome), p.id);
    if (p.nome_legado) profPorChave.set(chave(p.nome_legado), p.id);
  }
  const profPendente = new Map<string, { nome: string; quantidade: number }>();
  const profissionalDo = (nome: string): string | "novo" | null => {
    const k = chave(nome);
    if (escolhas.profissionais[k]) return escolhas.profissionais[k];
    if (profPorChave.has(k)) return profPorChave.get(k)!;
    const p = profPendente.get(k) ?? { nome: capitalizar(nome), quantidade: 0 };
    profPendente.set(k, { ...p, quantidade: p.quantidade + 1 });
    return null;
  };

  const tipoPorChave = new Map(tipos.data!.map((t) => [chave(t.nome), t]));
  const tiposNovos = new Map<string, string>();
  const pacientePorLegado = new Map(pacientes.data!.map((p) => [p.id_legado!, p.id]));
  const pacientesNovos = new Map<number, { nome: string; contato: string | null; planoId: string | null }>();

  const resolvidas = linhas.map((l) => {
    const { reuniao, plano, pendente: convenioPendenteNaLinha } = planoDo(l.convenio);
    const profissional = profissionalDo(l.profissional);
    const nomeTipo = reuniao ? TIPO_REUNIOES : l.tipo;
    const tipo = nomeTipo ? (tipoPorChave.get(chave(nomeTipo)) ?? null) : null;
    if (nomeTipo && !tipo) tiposNovos.set(chave(nomeTipo), nomeTipo);
    const pacienteId = l.pacienteIdLegado !== null ? (pacientePorLegado.get(l.pacienteIdLegado) ?? null) : null;
    if (!l.deletado && l.pacienteIdLegado !== null && !pacienteId && !pacientesNovos.has(l.pacienteIdLegado)) {
      pacientesNovos.set(l.pacienteIdLegado, { nome: l.pacienteNome, contato: l.contato, planoId: plano?.id ?? null });
    }
    const duracao = reuniao ? DURACAO_SEM_PLANO : (plano?.duracao_padrao_min ?? DURACAO_SEM_PLANO);
    const inicio = instanteNoFuso(l.data, l.hora);
    return {
      linha: l,
      pendente: convenioPendenteNaLinha || profissional === null,
      profissional,
      planoId: plano?.id ?? null,
      tipoNome: nomeTipo,
      tipoId: tipo?.id ?? null,
      pacienteId,
      inicio,
      fim: new Date(Date.parse(inicio) + duracao * 60_000).toISOString(),
      valor: l.valor ?? valorSugerido(plano, tipo?.area),
    };
  });

  return {
    resolvidas,
    pendencias: {
      convenios: [...convenioPendente].map(([k, v]) => ({ chave: k, ...v })),
      profissionais: [...profPendente].map(([k, v]) => ({ chave: k, ...v })),
    },
    pacientesNovos,
    tiposNovos,
    opcoes: {
      planos: planos.data!.map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      profissionais: profissionais.data!.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    },
  };
}

type Resolvida = Awaited<ReturnType<typeof resolver>>["resolvidas"][number];

/** Linha no formato de importar_agenda_legado. */
function paraBanco(r: Resolvida, ids?: { pacientes: Map<number, string>; tipos: Map<string, string>; profissionais: Map<string, string> }) {
  const l = r.linha;
  const profissional = r.profissional === "novo" ? (ids?.profissionais.get(chave(l.profissional)) ?? null) : r.profissional;
  return {
    mes: l.mes,
    id_legado: l.idLegado,
    excluir: l.deletado,
    paciente_id: r.pacienteId ?? (l.pacienteIdLegado !== null ? (ids?.pacientes.get(l.pacienteIdLegado) ?? null) : null),
    profissional_id: profissional,
    plano_id: r.planoId,
    tipo_id: r.tipoId ?? (r.tipoNome ? (ids?.tipos.get(chave(r.tipoNome)) ?? null) : null),
    inicio: r.inicio,
    fim: r.fim,
    valor: r.valor,
    status: l.status,
    motivo: l.motivo,
    observacao: l.observacao,
  };
}

function resumoPorMes(linhas: LinhaLegado[], contagens: Record<string, Partial<Record<Acao, number>>> | null): ResumoDoMes[] {
  const meses = [...new Set(linhas.map((l) => l.mes))].sort();
  return meses.map((mes) => {
    const doMes = linhas.filter((l) => l.mes === mes);
    return { mes, linhas: doMes.length, validas: doMes.filter((l) => !l.deletado).length, contagens: contagens ? (contagens[mes] ?? {}) : null };
  });
}

export async function analisarImportacao(dados: FormData): Promise<Analise | Falha> {
  const supabase = await createClient();
  if (!(await ehAdm(supabase))) return { ok: false, erro: "Apenas a direção pode importar a agenda." };
  try {
    const linhas = await lerArquivo(dados);
    if (linhas.length === 0) return { ok: false, erro: "Nenhum atendimento encontrado no arquivo." };
    const r = await resolver(supabase, linhas, lerEscolhas(dados));
    const semPendencia = r.pendencias.convenios.length === 0 && r.pendencias.profissionais.length === 0;

    // Simulação no banco (nada é gravado), só quando tudo foi casado.
    let contagens: Record<string, Partial<Record<Acao, number>>> | null = null;
    if (semPendencia) {
      const { data, error } = await supabase.rpc("importar_agenda_legado", {
        p_linhas: r.resolvidas.map((x) => paraBanco(x)) as unknown as Json,
        p_simular: true,
      });
      if (error) return { ok: false, erro: `Não foi possível analisar: ${error.message}` };
      contagens = data as Record<string, Partial<Record<Acao, number>>>;
    }
    return {
      ok: true,
      meses: resumoPorMes(linhas, contagens),
      pendencias: r.pendencias,
      pacientesNovos: r.pacientesNovos.size,
      tiposNovos: [...r.tiposNovos.values()],
      opcoes: r.opcoes,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof ArquivoInvalido ? e.message : "Não foi possível ler o arquivo." };
  }
}

export async function importarAgenda(dados: FormData): Promise<{ ok: true; contagens: Record<string, Partial<Record<Acao, number>>> } | Falha> {
  const supabase = await createClient();
  if (!(await ehAdm(supabase))) return { ok: false, erro: "Apenas a direção pode importar a agenda." };
  let meses: string[];
  try {
    meses = JSON.parse(String(dados.get("meses") ?? "[]"));
  } catch {
    meses = [];
  }
  if (!meses.length) return { ok: false, erro: "Escolha ao menos um mês." };

  try {
    const escolhas = lerEscolhas(dados);
    const linhas = (await lerArquivo(dados)).filter((l) => meses.includes(l.mes));
    const r = await resolver(supabase, linhas, escolhas);
    if (r.pendencias.convenios.length || r.pendencias.profissionais.length) return { ok: false, erro: "Escolha a correspondência dos convênios e profissionais pendentes." };

    // Correspondências escolhidas: ficam guardadas para as próximas importações.
    const convenios = Object.entries(escolhas.convenios).map(([nome, planoId]) => ({ nome, plano_id: planoId || null }));
    if (convenios.length) {
      const { error } = await supabase.from("convenios_legado").upsert(convenios);
      if (error) return { ok: false, erro: "Não foi possível guardar os convênios." };
    }
    for (const [k, id] of Object.entries(escolhas.profissionais)) {
      if (id === "novo") continue;
      const nomeLegado = linhas.find((l) => chave(l.profissional) === k)?.profissional;
      if (nomeLegado) await supabase.from("profissionais").update({ nome_legado: nomeLegado }).eq("id", id);
    }

    // Profissionais novos, tipos e pacientes que ainda não existem.
    const idsProfissionais = new Map<string, string>();
    for (const [k, id] of Object.entries(escolhas.profissionais)) {
      if (id !== "novo") continue;
      const exemplo = linhas.find((l) => chave(l.profissional) === k);
      if (!exemplo) continue;
      const { data, error } = await supabase
        .from("profissionais")
        .insert({ nome: capitalizar(exemplo.profissional), especialidade: exemplo.especialidade, nome_legado: exemplo.profissional })
        .select("id")
        .single();
      if (error) return { ok: false, erro: `Não foi possível cadastrar ${capitalizar(exemplo.profissional)}.` };
      idsProfissionais.set(k, data.id);
    }
    const idsTipos = new Map<string, string>();
    if (r.tiposNovos.size) {
      const { data, error } = await supabase
        .from("tipos_atendimento")
        .insert([...r.tiposNovos.values()].map((nome) => ({ nome })))
        .select("id, nome");
      if (error) return { ok: false, erro: "Não foi possível cadastrar os tipos novos." };
      for (const t of data) idsTipos.set(chave(t.nome), t.id);
    }
    const idsPacientes = new Map<number, string>();
    if (r.pacientesNovos.size) {
      const { data, error } = await supabase
        .from("pacientes")
        .insert([...r.pacientesNovos].map(([idLegado, p]) => ({ id_legado: idLegado, nome: p.nome, celular: p.contato, plano_id: p.planoId })))
        .select("id, id_legado");
      if (error) return { ok: false, erro: "Não foi possível cadastrar os pacientes novos." };
      for (const p of data) idsPacientes.set(p.id_legado!, p.id);
    }

    const ids = { pacientes: idsPacientes, tipos: idsTipos, profissionais: idsProfissionais };
    const { data, error } = await supabase.rpc("importar_agenda_legado", {
      p_linhas: r.resolvidas.map((x) => paraBanco(x, ids)) as unknown as Json,
      p_simular: false,
    });
    if (error) return { ok: false, erro: `Não foi possível importar: ${error.message}` };

    revalidatePath("/agenda");
    revalidatePath("/pacientes", "layout");
    return { ok: true, contagens: data as Record<string, Partial<Record<Acao, number>>> };
  } catch (e) {
    return { ok: false, erro: e instanceof ArquivoInvalido ? e.message : "Não foi possível importar o arquivo." };
  }
}
