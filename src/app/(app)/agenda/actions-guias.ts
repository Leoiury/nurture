"use server";

// Guias de autorização do convênio: gerar, renovar, excluir e relacionar atendimentos.
// A cobertura (que atendimentos cada guia cobre) é calculada no banco
// (guias_dos_atendimentos); aqui ficam as datas dos atendimentos que faltam.

import { revalidatePath } from "next/cache";
import { carregarDiasEspeciais } from "@/lib/agenda/dados";
import { semExpediente } from "@/lib/agenda/feriados";
import { candidatasDeContinuacao, frequenciaEntre, proximasDatas } from "@/lib/agenda/guias";
import type { Frequencia } from "@/lib/agenda/recorrencia";
import { formatarHora, hoje, instanteNoFuso, partesNoFuso } from "@/lib/agenda/tempo";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true; quantidade?: number } | { ok: false; erro: string };

/** Guia do atendimento e o que dá para fazer com ela no painel. */
export async function guiaDoAtendimento(id: string) {
  const supabase = await createClient();
  const { data: a, error } = await supabase
    .from("atendimentos")
    .select("id, inicio, status, recorrencia_id, plano:planos(exige_guia)")
    .eq("id", id)
    .single();
  if (error) throw new Error("Atendimento não encontrado.");

  const [cobertura, cadeia] = await Promise.all([
    supabase.from("guias_dos_atendimentos").select("guia_id, numero, ordem, posicao, quantidade, renovada").eq("atendimento_id", id).maybeSingle(),
    a.recorrencia_id
      ? supabase.from("guias").select("id, numero, ordem, a_partir_de").eq("recorrencia_id", a.recorrencia_id).order("ordem")
      : null,
  ]);
  if (cobertura.error || cadeia?.error) throw new Error("Não foi possível carregar a guia.");

  const guias = cadeia?.data ?? [];
  const ultima = guias.at(-1) ?? null;
  const atual = cobertura.data;
  const desmarcado = a.status === "desmarcado";
  // Sem cobertura numa série com guia: antes do início da cadeia, ou depois do fim dela.
  const antesDaCadeia = !atual && guias.length > 0 && a.inicio < guias[0].a_partir_de;
  return {
    exigeGuia: a.plano?.exige_guia ?? false,
    atual: atual && { id: atual.guia_id!, numero: atual.numero, ordem: atual.ordem!, posicao: atual.posicao!, quantidade: atual.quantidade!, renovada: atual.renovada! },
    serie: !!a.recorrencia_id,
    podeGerar: !desmarcado && guias.length === 0,
    /** Guia a renovar: a última da cadeia, se este atendimento está nela ou depois do fim. */
    renovar: !desmarcado && ultima && !antesDaCadeia && (!atual || atual.guia_id === ultima.id) ? { id: ultima.id, numero: ultima.numero } : null,
    /** Excluir: só a última guia da cadeia. */
    excluir: atual && ultima && atual.guia_id === ultima.id ? ultima.id : null,
    inicioDaCadeia: antesDaCadeia ? guias[0].a_partir_de : null,
  };
}

export type GuiaDoAtendimento = Awaited<ReturnType<typeof guiaDoAtendimento>>;

export type PedidoDeGuia =
  | { tipo: "gerar"; atendimentoId: string; quantidade: number; numero: string; frequencia: Frequencia }
  | { tipo: "renovar"; guiaId: string; quantidade: number; numero: string };

type Plano = {
  /** Atendimentos da série que a guia vai cobrir e já estão na agenda. */
  agendados: number;
  /** Instantes dos atendimentos que serão criados para completar a guia. */
  novos: string[];
  frequencia: Frequencia;
  /** Atendimento avulso: vira uma série. */
  avulso: boolean;
};

/** Quantos atendimentos a guia encontra na agenda e quais precisam ser criados (mesma conta do banco). */
async function planejar(p: PedidoDeGuia): Promise<Plano> {
  if (!(Number.isInteger(p.quantidade) && p.quantidade >= 1 && p.quantidade <= 120)) throw new Error("A guia deve ter de 1 a 120 atendimentos.");
  const supabase = await createClient();

  let serie: string | null;
  let desde: string;
  let necessarios = p.quantidade;
  let frequencia: Frequencia = p.tipo === "gerar" ? p.frequencia : "semanal";
  if (p.tipo === "gerar") {
    const { data, error } = await supabase.from("atendimentos").select("inicio, recorrencia_id").eq("id", p.atendimentoId).single();
    if (error) throw new Error("Atendimento não encontrado.");
    serie = data.recorrencia_id;
    desde = data.inicio;
    if (!serie) {
      // Avulso: ele mesmo é o primeiro; os demais seguem a frequência escolhida.
      const ultima = partesNoFuso(data.inicio);
      return { agendados: 1, avulso: true, frequencia, novos: await datasNovas(ultima.data, formatarHora(ultima.minutos), frequencia, p.quantidade - 1) };
    }
  } else {
    const { data: guia, error } = await supabase.from("guias").select("recorrencia_id").eq("id", p.guiaId).single();
    if (error) throw new Error("Guia não encontrada.");
    serie = guia.recorrencia_id;
    const cadeia = await supabase.from("guias").select("quantidade, a_partir_de").eq("recorrencia_id", serie);
    if (cadeia.error) throw new Error("Não foi possível carregar a guia.");
    desde = cadeia.data.map((g) => g.a_partir_de).sort()[0];
    necessarios += cadeia.data.reduce((s, g) => s + g.quantidade, 0);
  }

  const [lista, regra] = await Promise.all([
    supabase.from("atendimentos").select("inicio, status").eq("recorrencia_id", serie).is("excluido_em", null).order("inicio"),
    supabase.from("recorrencias").select("frequencia").eq("id", serie).single(),
  ]);
  if (lista.error || regra.error) throw new Error("Não foi possível carregar a série.");
  frequencia = regra.data.frequencia;

  const validos = lista.data.filter((a) => a.status !== "desmarcado");
  const disponiveis = validos.filter((a) => new Date(a.inicio) >= new Date(desde)).length;
  const faltam = Math.max(necessarios - disponiveis, 0);
  // A série continua depois do último atendimento, no horário do último que conta.
  const ultima = partesNoFuso(lista.data.at(-1)!.inicio).data;
  const modelo = partesNoFuso((validos.at(-1) ?? lista.data.at(-1)!).inicio);
  return {
    // As guias anteriores da cadeia ficam com os primeiros; esta, com os seguintes.
    agendados: Math.min(Math.max(disponiveis - (necessarios - p.quantidade), 0), p.quantidade),
    avulso: false,
    frequencia,
    novos: await datasNovas(ultima, formatarHora(modelo.minutos), frequencia, faltam),
  };
}

async function datasNovas(ultima: string, hora: string, frequencia: Frequencia, quantidade: number): Promise<string[]> {
  if (quantidade <= 0) return [];
  const candidatas = candidatasDeContinuacao(ultima, frequencia, hoje());
  if (candidatas.length === 0) return [];
  const especiais = await carregarDiasEspeciais(candidatas[0], candidatas.at(-1)!);
  return proximasDatas(candidatas, quantidade, (d) => semExpediente(especiais[d])).map((d) => instanteNoFuso(d, hora));
}

/** Prévia no formulário: quantos já estão agendados e as datas que serão criadas. */
export async function preverGuia(p: PedidoDeGuia): Promise<{ ok: true; agendados: number; novos: string[]; frequencia: Frequencia; avulso: boolean } | { ok: false; erro: string }> {
  try {
    return { ok: true, ...(await planejar(p)) };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

function concluir(error: { message: string } | null, quantidade?: number): Resultado {
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/agenda");
  revalidatePath("/pacientes", "layout");
  return { ok: true, quantidade };
}

/** Gera ou renova a guia, criando os atendimentos que faltam. quantidade = atendimentos criados. */
export async function salvarGuia(p: PedidoDeGuia): Promise<Resultado> {
  let plano: Plano;
  try {
    plano = await planejar(p);
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  const supabase = await createClient();
  const { error } =
    p.tipo === "gerar"
      ? await supabase.rpc("gerar_guia", {
          p_atendimento: p.atendimentoId,
          p_quantidade: p.quantidade,
          p_numero: p.numero.trim() || undefined,
          p_frequencia: plano.avulso ? p.frequencia : undefined,
          p_novos: plano.novos,
        })
      : await supabase.rpc("renovar_guia", { p_guia: p.guiaId, p_quantidade: p.quantidade, p_numero: p.numero.trim() || undefined, p_novos: plano.novos });
  return concluir(error, plano.novos.length);
}

export async function excluirGuia(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_guia", { p_guia: id });
  return concluir(error);
}

export type ParaRelacionar = {
  id: string;
  inicio: string;
  status: string;
  profissionais: string;
  /** Mesmo dia da semana e mesma hora do atendimento-base. */
  mesmoHorario: boolean;
  /** Está em outra série que já tem guia (não pode ser relacionado). */
  emSerieComGuia: boolean;
};

/**
 * Atendimentos do paciente com o(s) mesmo(s) profissional(is), a partir do
 * atendimento-base, que ainda não estão na série dele.
 */
export async function atendimentosParaRelacionar(id: string): Promise<ParaRelacionar[]> {
  const supabase = await createClient();
  const { data: base, error } = await supabase
    .from("atendimentos")
    .select("id, inicio, paciente_id, recorrencia_id, profissionais:atendimento_profissionais(profissional_id)")
    .eq("id", id)
    .single();
  if (error || !base.paciente_id) throw new Error("Atendimento não encontrado.");

  const { data, error: erroLista } = await supabase
    .from("atendimentos")
    .select("id, inicio, status, recorrencia_id, profissionais:atendimento_profissionais(profissional:profissionais(id, nome))")
    .eq("paciente_id", base.paciente_id)
    .is("excluido_em", null)
    .gte("inicio", base.inicio)
    .neq("id", base.id)
    .order("inicio");
  if (erroLista) throw new Error("Não foi possível carregar os atendimentos.");

  const daBase = new Set(base.profissionais.map((p) => p.profissional_id));
  const candidatos = data.filter(
    (a) => a.profissionais.some((p) => daBase.has(p.profissional.id)) && !(base.recorrencia_id && a.recorrencia_id === base.recorrencia_id),
  );
  const series = [...new Set(candidatos.map((a) => a.recorrencia_id).filter((r): r is string => !!r))];
  const comGuia = new Set<string>();
  if (series.length) {
    const g = await supabase.from("guias").select("recorrencia_id").in("recorrencia_id", series);
    if (g.error) throw new Error("Não foi possível carregar as guias.");
    for (const x of g.data) comGuia.add(x.recorrencia_id);
  }

  const b = partesNoFuso(base.inicio);
  const diaDaSemanaDe = (data: string) => new Date(`${data}T12:00:00Z`).getUTCDay();
  return candidatos.map((a) => {
    const p = partesNoFuso(a.inicio);
    return {
      id: a.id,
      inicio: a.inicio,
      status: a.status,
      profissionais: a.profissionais.map((x) => x.profissional.nome).join(", "),
      mesmoHorario: p.minutos === b.minutos && diaDaSemanaDe(p.data) === diaDaSemanaDe(b.data),
      emSerieComGuia: !!a.recorrencia_id && comGuia.has(a.recorrencia_id),
    };
  });
}

/** Os escolhidos passam para a série do atendimento-base, com o plano e o valor dele. */
export async function relacionarAtendimentos(baseId: string, ids: string[]): Promise<Resultado> {
  if (ids.length === 0) return { ok: false, erro: "Escolha ao menos um atendimento." };
  const supabase = await createClient();
  const { data: atendimentos, error } = await supabase.from("atendimentos").select("id, inicio").in("id", [baseId, ...ids]).order("inicio");
  if (error) return { ok: false, erro: "Não foi possível carregar os atendimentos." };
  // Se o base for avulso, a frequência da nova série vem do intervalo até o próximo.
  const [primeiro, segundo] = atendimentos.map((a) => partesNoFuso(a.inicio).data);
  const frequencia = segundo ? frequenciaEntre(primeiro, segundo) : "semanal";
  const { data, error: erroRpc } = await supabase.rpc("relacionar_atendimentos", { p_base: baseId, p_ids: ids, p_frequencia: frequencia });
  return concluir(erroRpc, data ?? 0);
}
