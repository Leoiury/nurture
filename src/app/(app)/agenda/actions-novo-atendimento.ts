"use server";

// Ações do painel "Novo atendimento".

import { revalidatePath } from "next/cache";
import { carregarDiasEspeciais, carregarEscalas } from "@/lib/agenda/dados";
import { escalaDoDia, intersecao } from "@/lib/agenda/escala";
import { semExpediente } from "@/lib/agenda/feriados";
import { horariosEmSequencia, horariosLivres, type Ocupacao } from "@/lib/agenda/horarios-livres";
import { MAXIMO_DE_SESSOES, candidatasDaSerie, datasDaSerie, datasSemBloqueios, type FimDaSerie, type Frequencia } from "@/lib/agenda/recorrencia";
import { profissionaisDoTipo, type TipoComProfissionais } from "@/lib/agenda/tipos";
import { FUSO, ehDataValida, formatarHora, inicioDoDiaISO, instanteNoFuso, partesNoFuso, somarDias } from "@/lib/agenda/tempo";
import type { ArgsCriar } from "@/lib/agenda/planejamento";
import type { Database } from "@/lib/supabase/database.types";
import { ehAdm } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

type Status = Database["public"]["Enums"]["status_atendimento"];

/** Listas do formulário: pacientes, profissionais, planos e tipos (só ativos). */
export async function opcoesDoFormulario() {
  const supabase = await createClient();
  const [pacientes, profissionais, planos, tipos] = await Promise.all([
    supabase.from("pacientes").select("id, nome, responsavel, plano_id").eq("ativo", true).order("nome"),
    supabase.from("profissionais").select("id, nome, especialidade").eq("ativo", true).order("nome"),
    // Todos os planos: os inativos só aparecem quando já estão no atendimento/paciente.
    supabase
      .from("planos")
      .select("id, nome, cor, duracao_padrao_min, valor_padrao, valor_fonoaudiologia, valor_psicologia, valor_nutricao, valor_psicopedagogia, ativo")
      .order("nome"),
    supabase.from("tipos_atendimento").select("id, nome, area, cor, vinculos:tipos_atendimento_profissionais(profissional_id)").eq("ativo", true).order("nome"),
  ]);
  for (const r of [pacientes, profissionais, planos, tipos]) if (r.error) throw new Error("Não foi possível carregar o formulário.");
  const tiposComProfissionais: TipoComProfissionais[] = tipos.data!.map((t) => ({
    id: t.id,
    nome: t.nome,
    profissionais: t.vinculos.map((v) => v.profissional_id),
    area: t.area,
    cor: t.cor,
  }));
  // "Anteriores e futuros" nos ajustes de valor: só administradores.
  return { pacientes: pacientes.data!, profissionais: profissionais.data!, planos: planos.data!, tipos: tiposComProfissionais, ehAdm: await ehAdm() };
}

export type OpcoesDoFormulario = Awaited<ReturnType<typeof opcoesDoFormulario>>;

/** pularFeriados: tira da série os feriados e recessos (mantendo o nº de sessões). */
export type Serie = { frequencia: Frequencia; fim: FimDaSerie; pularFeriados: boolean } | null;

/** Feriados (nacionais e cadastrados), pontos facultativos e recessos do período, por dia. */
export async function diasEspeciaisNoPeriodo(inicio: string, fim: string) {
  return carregarDiasEspeciais(inicio, fim);
}

type Agendamento = {
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  duracaoMin: number;
  serie: Serie;
};

/** Instantes de início de cada atendimento (um só, ou a série inteira). */
async function inicios({ data, hora, serie }: Agendamento): Promise<string[]> {
  let datas = [data];
  if (serie?.pularFeriados) {
    const candidatas = candidatasDaSerie(data, serie.frequencia, serie.fim);
    const especiais = candidatas.length ? await carregarDiasEspeciais(candidatas[0], candidatas.at(-1)!) : {};
    datas = datasSemBloqueios(data, serie.frequencia, serie.fim, (d) => semExpediente(especiais[d]));
  } else if (serie) {
    datas = datasDaSerie(data, serie.frequencia, serie.fim);
  }
  return datas.map((d) => instanteNoFuso(d, hora));
}

export type Conflito = { inicio: string; tipo: "profissional" | "paciente"; descricao: string };

const formatoConflito = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Atendimentos já existentes que se sobrepõem aos novos, com o mesmo profissional
 * (paralelo) ou o mesmo paciente (com outro profissional). Só avisa; não bloqueia.
 */
export async function verificarConflitos(
  agendamento: Agendamento & {
    profissionais: string[];
    pacienteId: string | null;
    /** Na edição: o próprio atendimento (e a série, se o alcance for além dele) não conta como conflito. */
    ignorar?: { id: string; recorrenciaId: string | null };
  },
): Promise<Conflito[]> {
  const lista = await inicios(agendamento);
  if (lista.length === 0 || (agendamento.profissionais.length === 0 && !agendamento.pacienteId)) return [];

  const duracaoMs = agendamento.duracaoMin * 60_000;
  const janelas = lista.map((i) => ({ inicio: new Date(i).getTime(), fim: new Date(i).getTime() + duracaoMs }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atendimentos")
    .select("id, recorrencia_id, inicio, fim, paciente_id, paciente:pacientes(nome), profissionais:atendimento_profissionais(profissional:profissionais(id, nome))")
    .is("excluido_em", null)
    .neq("status", "desmarcado")
    .lt("inicio", new Date(Math.max(...janelas.map((j) => j.fim))).toISOString())
    .gt("fim", new Date(Math.min(...janelas.map((j) => j.inicio))).toISOString());
  if (error) throw new Error("Não foi possível verificar conflitos.");

  const conflitos: Conflito[] = [];
  const { ignorar } = agendamento;
  for (const existente of data) {
    if (ignorar && (existente.id === ignorar.id || (ignorar.recorrenciaId && existente.recorrencia_id === ignorar.recorrenciaId))) continue;
    const ini = new Date(existente.inicio).getTime();
    const fim = new Date(existente.fim).getTime();
    const janela = janelas.find((j) => j.inicio < fim && j.fim > ini);
    if (!janela) continue;
    const quando = formatoConflito.format(new Date(existente.inicio));
    for (const { profissional } of existente.profissionais) {
      if (agendamento.profissionais.includes(profissional.id)) {
        conflitos.push({
          inicio: existente.inicio,
          tipo: "profissional",
          descricao: `${profissional.nome} já atende ${existente.paciente?.nome ?? "outro atendimento"} (${quando})`,
        });
      }
    }
    if (agendamento.pacienteId && existente.paciente_id === agendamento.pacienteId) {
      const outros = existente.profissionais.map((p) => p.profissional.nome).join(", ");
      conflitos.push({ inicio: existente.inicio, tipo: "paciente", descricao: `Paciente já tem atendimento com ${outros} (${quando})` });
    }
  }
  return conflitos.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export type NovoAtendimento = Agendamento & {
  pacienteId: string;
  profissionais: string[];
  planoId: string | null;
  tipoId: string | null;
  valor: number | null;
  status: Status;
  observacao: string;
};

export type ResultadoCriacao = { ok: true; quantidade: number } | { ok: false; erro: string };

/**
 * Valida e monta os argumentos de criar_atendimentos (datas da série já calculadas).
 * Usado ao salvar e pelo planejamento, que guarda os argumentos para aplicar depois.
 */
export async function argsDeCriacao(novo: NovoAtendimento): Promise<{ ok: true; args: ArgsCriar } | { ok: false; erro: string }> {
  if (!novo.pacienteId) return { ok: false, erro: "Escolha o paciente." };
  if (novo.profissionais.length === 0) return { ok: false, erro: "Escolha ao menos um profissional." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novo.data) || !/^\d{2}:\d{2}$/.test(novo.hora)) return { ok: false, erro: "Informe data e horário." };
  if (!(novo.duracaoMin > 0 && novo.duracaoMin <= 12 * 60)) return { ok: false, erro: "Duração inválida." };
  if (novo.valor !== null && !(novo.valor >= 0)) return { ok: false, erro: "Valor inválido." };

  let lista: string[];
  try {
    lista = await inicios(novo);
  } catch {
    return { ok: false, erro: "Data inválida." }; // ex.: 31/02 não converte
  }
  if (lista.length === 0) return { ok: false, erro: "A repetição não gera nenhuma data: confira a data final." };
  if (lista.length > MAXIMO_DE_SESSOES) return { ok: false, erro: `Uma série pode ter no máximo ${MAXIMO_DE_SESSOES} atendimentos.` };

  return {
    ok: true,
    args: {
      p_paciente_id: novo.pacienteId,
      p_profissionais: novo.profissionais,
      p_plano_id: novo.planoId ?? undefined,
      p_tipo_id: novo.tipoId ?? undefined,
      p_valor: novo.valor ?? undefined,
      p_status: novo.status,
      p_inicios: lista,
      p_duracao_min: novo.duracaoMin,
      p_observacao: novo.observacao || undefined,
      p_frequencia: novo.serie?.frequencia,
      p_data_fim: novo.serie?.fim.tipo === "data" ? novo.serie.fim.ate : undefined,
      p_sessoes: novo.serie?.fim.tipo === "sessoes" ? novo.serie.fim.quantidade : undefined,
    },
  };
}

export async function criarAtendimentos(novo: NovoAtendimento): Promise<ResultadoCriacao> {
  const preparado = await argsDeCriacao(novo);
  if (!preparado.ok) return preparado;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_atendimentos", preparado.args);
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/agenda");
  return { ok: true, quantidade: data.length };
}

/**
 * Atendimentos em sequência (um com cada profissional, colados): todos ou nenhum.
 * Cada item já vem com o seu profissional e horário.
 */
export async function criarEmSequencia(novos: NovoAtendimento[]): Promise<ResultadoCriacao> {
  if (novos.length < 2) return { ok: false, erro: "A sequência precisa de ao menos dois profissionais." };
  const itens: ArgsCriar[] = [];
  for (const novo of novos) {
    const preparado = await argsDeCriacao(novo);
    if (!preparado.ok) return preparado;
    itens.push(preparado.args);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_atendimentos_em_sequencia", { p_itens: itens });
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };
  revalidatePath("/agenda");
  return { ok: true, quantidade: data };
}

export type NovoPaciente = { nome: string; responsavel: string; celular: string; planoId: string | null };

/** Cadastro rápido, feito de dentro do painel de novo atendimento. */
export async function criarPaciente(novo: NovoPaciente) {
  const nome = novo.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 3) return { ok: false as const, erro: "Informe o nome do paciente." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pacientes")
    .insert({ nome, responsavel: novo.responsavel.trim() || null, celular: novo.celular.trim() || null, plano_id: novo.planoId })
    .select("id, nome, responsavel, plano_id")
    .single();
  if (error) return { ok: false as const, erro: "Não foi possível cadastrar o paciente." };
  return { ok: true as const, paciente: data };
}

export type BuscaDeHorarios = {
  dataInicial: string; // AAAA-MM-DD: busca a partir dela (ou de hoje, se já passou)
  duracaoMin: number;
  /** Escolhidos no formulário: todos precisam estar livres. Vazio: qualquer compatível com o tipo. */
  profissionais: string[];
  tipoId: string | null;
  pacienteId: string | null;
  /** Na edição, o próprio atendimento não ocupa o horário. */
  ignorarId?: string;
  /** Com 2+ profissionais: um atendimento com cada um, colados (em qualquer ordem), em vez de juntos. */
  emSequencia?: boolean;
};

export type HorarioSugerido = { data: string; hora: string; profissionalIds: string[] };

const DIAS_DE_BUSCA = 14;

/** Próximos horários livres (2 semanas, na escala de cada profissional, sem feriados/recessos). */
export async function buscarHorariosLivres(b: BuscaDeHorarios): Promise<{ sugestoes: HorarioSugerido[]; ate: string }> {
  if (!(b.duracaoMin > 0)) return { sugestoes: [], ate: b.dataInicial };
  const agora = partesNoFuso(new Date());
  const inicio = ehDataValida(b.dataInicial) && b.dataInicial > agora.data ? b.dataInicial : agora.data;
  const fim = somarDias(inicio, DIAS_DE_BUSCA - 1);
  const supabase = await createClient();

  // Quem pode atender: os escolhidos (juntos) ou cada compatível com o tipo (alternativas).
  let grupos: string[][];
  if (b.profissionais.length) {
    grupos = [b.profissionais];
  } else {
    const [profs, vinculos] = await Promise.all([
      supabase.from("profissionais").select("id").eq("ativo", true),
      b.tipoId ? supabase.from("tipos_atendimento_profissionais").select("profissional_id").eq("tipo_id", b.tipoId) : null,
    ]);
    if (profs.error || vinculos?.error) throw new Error("Não foi possível buscar os profissionais.");
    grupos = profissionaisDoTipo(vinculos?.data.map((v) => v.profissional_id) ?? null, profs.data).map((p) => [p.id]);
  }
  if (!grupos.length) return { sugestoes: [], ate: fim };

  const [especiais, escalas, atendimentos] = await Promise.all([
    carregarDiasEspeciais(inicio, fim),
    carregarEscalas([...new Set(grupos.flat())]),
    supabase
      .from("atendimentos")
      .select("id, inicio, fim, paciente_id, profissionais:atendimento_profissionais(profissional_id)")
      .is("excluido_em", null)
      .neq("status", "desmarcado")
      .gte("inicio", inicioDoDiaISO(inicio))
      .lt("inicio", inicioDoDiaISO(somarDias(fim, 1))),
  ]);
  if (atendimentos.error) throw new Error("Não foi possível buscar os horários.");

  // A escala de cada um decide os dias (fim de semana só para quem trabalha nele).
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (!semExpediente(especiais[d])) dias.push(d);
  // Um grupo trabalha junto só onde a escala de todos coincide.
  const expedienteDo = (grupo: string[], data: string) =>
    grupo.map((id) => escalaDoDia(escalas.get(id) ?? null, data, especiais[data])).reduce((a, b) => intersecao(a, b));

  const ocupacao = new Map<string, Ocupacao[]>();
  const ocupacaoDoPaciente: Ocupacao[] = [];
  for (const a of atendimentos.data) {
    if (a.id === b.ignorarId) continue;
    const ini = partesNoFuso(a.inicio);
    const fimA = partesNoFuso(a.fim);
    const o = { data: ini.data, inicio: ini.minutos, fim: fimA.data === ini.data ? fimA.minutos : 24 * 60 };
    for (const { profissional_id } of a.profissionais) ocupacao.set(profissional_id, [...(ocupacao.get(profissional_id) ?? []), o]);
    if (b.pacienteId && a.paciente_id === b.pacienteId) ocupacaoDoPaciente.push(o);
  }

  const emSequencia = !!b.emSequencia && b.profissionais.length > 1;
  const livres = (emSequencia ? horariosEmSequencia : horariosLivres)({
    dias,
    duracao: b.duracaoMin,
    grupos,
    ocupacao,
    ocupacaoDoPaciente,
    expedienteDo,
    agora: { data: agora.data, minutos: agora.minutos },
    // Com vários profissionais alternativos, menos por profissional para caber na tela.
    limitePorPeriodo: grupos.length > 1 ? 2 : 4,
  });
  return {
    sugestoes: livres.slice(0, 80).map((l) => ({ data: l.data, hora: formatarHora(l.inicio), profissionalIds: l.profissionalIds })),
    ate: fim,
  };
}
