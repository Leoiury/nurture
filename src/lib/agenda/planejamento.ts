// Planejamento da agenda: um rascunho de operações sobre a agenda real.
//
// Cada operação guarda os argumentos da função do banco que a executa (a mesma
// que a agenda usa) e, se mexe num atendimento existente, como ele estava
// ("esperado") — ao aplicar, o banco confere e recusa se a agenda real mudou.
// Aqui ficam a simulação (a agenda real + as operações, para exibir) e as
// descrições da revisão. Módulo sem React e sem servidor.

import type { AtendimentoAgenda, Status } from "./dados";
import type { Database } from "@/lib/supabase/database.types";
import { formatarHora, hoje as hojeNoFuso, instanteNoFuso, nomeCurtoDoDia, partesNoFuso, somarDias } from "./tempo";

type Funcoes = Database["public"]["Functions"];
export type ArgsCriar = Funcoes["criar_atendimentos"]["Args"];
export type ArgsEditar = Funcoes["editar_atendimentos"]["Args"];
export type ArgsMover = Funcoes["mover_atendimento"]["Args"];
export type ArgsDesmarcar = Funcoes["desmarcar_atendimentos"]["Args"];
export type ArgsExcluir = Funcoes["excluir_atendimentos"]["Args"];

export type ArgsPlanoFuturos = Funcoes["mudar_plano_dos_futuros"]["Args"];
/** p_area: área do tipo (null: vale o próprio tipo, p_tipo). p_escopo: "futuros" ou "todos" (anteriores também). */
export type ArgsValoresPaciente = { p_paciente: string; p_area: string | null; p_tipo: string | null; p_valor: number | null; p_escopo: "futuros" | "todos"; p_ignorar?: string };
export type ArgsPlanoPadrao = { p_paciente: string; p_plano: string | null };

export type Esperado = { inicio: string; fim: string; status: Status; profissionais: string[] };
/** O que a tela mostra de um atendimento criado/editado no planejamento. */
export type Exibicao = { paciente: string | null; plano: { nome: string; cor: string } | null; tipo: string | null; area?: string | null };

type Base = { chave: string; descricao: string };
export type Operacao =
  | (Base & { tipo: "criar"; args: ArgsCriar; exibicao: Exibicao })
  | (Base & { tipo: "editar"; args: ArgsEditar; exibicao: Exibicao; esperado: Esperado })
  | (Base & { tipo: "mover"; args: ArgsMover; esperado: Esperado })
  | (Base & { tipo: "desmarcar"; args: ArgsDesmarcar; esperado: Esperado })
  | (Base & { tipo: "excluir"; args: ArgsExcluir; esperado: Esperado })
  // Ajustes do paciente (em massa; sem "esperado": valem para o que houver ao aplicar).
  | (Base & { tipo: "plano_padrao"; args: ArgsPlanoPadrao })
  | (Base & { tipo: "plano_futuros"; args: ArgsPlanoFuturos; exibicao: Pick<Exibicao, "plano"> })
  | (Base & { tipo: "valores_paciente"; args: ArgsValoresPaciente });

/** Operações sobre um atendimento existente (têm p_id e "esperado"). */
export const sobreAtendimento = (op: Operacao): op is Extract<Operacao, { esperado: Esperado }> => "esperado" in op;

/** Atendimentos criados no planejamento têm id "novo:<chave da operação>:<índice>". */
export const idNovo = (chave: string, indice: number) => `novo:${chave}:${indice}`;
export function lerIdNovo(id: string): { chave: string; indice: number } | null {
  const m = /^novo:(.+):(\d+)$/.exec(id);
  return m ? { chave: m[1], indice: Number(m[2]) } : null;
}

export function esperadoDe(a: AtendimentoAgenda): Esperado {
  return {
    inicio: instanteNoFuso(a.data, formatarHora(a.inicio)),
    fim: instanteNoFuso(a.data, formatarHora(a.fim)),
    status: a.status,
    profissionais: a.profissionalIds.toSorted(),
  };
}

/** Posição no tempo, para "este e os próximos". */
const momento = (a: AtendimentoAgenda) => `${a.data} ${formatarHora(a.inicio)}`;

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/** Os atendimentos atingidos por uma operação numa série (mesma regra do banco). */
function doAlcance(lista: AtendimentoAgenda[], base: AtendimentoAgenda, alcance: string): AtendimentoAgenda[] {
  if (alcance === "este" || !base.recorrenciaId) return [base];
  return lista.filter((a) => a.recorrenciaId === base.recorrenciaId && (alcance === "todos" || momento(a) >= momento(base)));
}

const hhmm = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/**
 * A agenda como ficará: os atendimentos reais com as operações aplicadas em ordem.
 * `rascunho` marca o que difere da agenda real.
 */
export function simular(base: AtendimentoAgenda[], operacoes: Operacao[], nomePorId: Map<string, string>, hoje: string = hojeNoFuso()): AtendimentoAgenda[] {
  let lista = base.map((a) => ({ ...a }));
  const nomes = (ids: string[]) => ids.map((id) => nomePorId.get(id) ?? "");
  const marcar = (a: AtendimentoAgenda, r: "alterado" | "desmarcado") => (a.rascunho === "novo" ? "novo" : r);

  for (const op of operacoes) {
    if (op.tipo === "criar") {
      const { args } = op;
      op.args.p_inicios.forEach((iso, i) => {
        const p = partesNoFuso(iso);
        lista.push({
          id: idNovo(op.chave, i),
          profissionalIds: args.p_profissionais,
          profissionalNomes: nomes(args.p_profissionais),
          data: p.data,
          inicio: p.minutos,
          fim: Math.min(p.minutos + args.p_duracao_min, 24 * 60),
          status: args.p_status ?? "marcado",
          paciente: op.exibicao.paciente,
          plano: op.exibicao.plano,
          tipo: op.exibicao.tipo,
          recorrenciaId: args.p_frequencia ? `novo:${op.chave}` : null,
          pacienteId: args.p_paciente_id,
          importado: false,
          tipoId: args.p_tipo_id ?? null,
          area: op.exibicao.area ?? null,
          rascunho: "novo",
        });
      });
      continue;
    }

    // Ajustes do paciente: atingem os atendimentos carregados que o banco atingiria.
    if (op.tipo === "plano_padrao") continue; // cadastro do paciente: nada muda na grade
    if (op.tipo === "plano_futuros" || op.tipo === "valores_paciente") {
      for (const a of lista) {
        if (a.pacienteId !== op.args.p_paciente || a.status === "desmarcado" || a.id === op.args.p_ignorar) continue;
        if (op.tipo === "plano_futuros") {
          if (a.data < hoje) continue;
          Object.assign(a, { plano: op.exibicao.plano, rascunho: marcar(a, "alterado") });
        } else {
          const { args } = op;
          const doSegmento = args.p_area ? a.area === args.p_area : a.tipoId === args.p_tipo;
          if (!doSegmento || (args.p_escopo === "futuros" && a.data < hoje)) continue;
          a.rascunho = marcar(a, "alterado");
        }
      }
      continue;
    }

    const alvo = lista.find((a) => a.id === op.args.p_id);
    if (!alvo) continue; // atendimento fora do que foi carregado

    if (op.tipo === "mover") {
      const p = partesNoFuso(op.args.p_inicio);
      const duracao = alvo.fim - alvo.inicio;
      const { p_de_profissional: de, p_para_profissional: para } = op.args;
      let ids = alvo.profissionalIds;
      if (de && para && de !== para) ids = [...ids.filter((id) => id !== de), ...(ids.includes(para) ? [] : [para])];
      Object.assign(alvo, { data: p.data, inicio: p.minutos, fim: p.minutos + duracao, profissionalIds: ids, profissionalNomes: nomes(ids), rascunho: marcar(alvo, "alterado") });
    } else if (op.tipo === "editar") {
      const { args } = op;
      const deslocamento = diasEntre(alvo.data, args.p_data);
      const inicio = hhmm(args.p_hora);
      for (const a of doAlcance(lista, alvo, args.p_alcance)) {
        Object.assign(a, {
          data: somarDias(a.data, deslocamento),
          pacienteId: args.p_paciente_id,
          tipoId: args.p_tipo_id ?? null,
          area: op.exibicao.area ?? a.area,
          inicio,
          fim: Math.min(inicio + args.p_duracao_min, 24 * 60),
          profissionalIds: args.p_profissionais,
          profissionalNomes: nomes(args.p_profissionais),
          paciente: op.exibicao.paciente,
          plano: op.exibicao.plano,
          tipo: op.exibicao.tipo,
          rascunho: marcar(a, "alterado"),
        });
      }
    } else if (op.tipo === "desmarcar") {
      for (const a of doAlcance(lista, alvo, op.args.p_alcance)) {
        if (a.id !== alvo.id && a.status !== "marcado" && a.status !== "confirmado") continue;
        Object.assign(a, { status: "desmarcado", rascunho: marcar(a, "desmarcado") });
      }
    } else if (op.tipo === "excluir") {
      const fora = new Set(doAlcance(lista, alvo, op.args.p_alcance).map((a) => a.id));
      lista = lista.filter((a) => !fora.has(a.id));
    }
  }
  return lista;
}

/** Tira do planejamento todas as alterações de um atendimento existente. */
export function semAlteracoesDe(operacoes: Operacao[], id: string): Operacao[] {
  return operacoes.filter((op) => !sobreAtendimento(op) || op.args.p_id !== id);
}

/** Tira um atendimento criado no planejamento (ou a série inteira). */
export function semNovo(operacoes: Operacao[], id: string, serieInteira: boolean): Operacao[] {
  const alvo = lerIdNovo(id);
  if (!alvo) return operacoes;
  return operacoes.flatMap((op) => {
    if (op.chave !== alvo.chave || op.tipo !== "criar") return [op];
    const inicios = op.args.p_inicios.filter((_, i) => i !== alvo.indice);
    return serieInteira || inicios.length === 0 ? [] : [{ ...op, args: { ...op.args, p_inicios: inicios } }];
  });
}

/**
 * Mover um atendimento criado no planejamento: muda a própria operação de criação.
 * Numa série, trocar de profissional separa aquele atendimento da série (vira avulso).
 */
export function moverNovo(operacoes: Operacao[], id: string, novoInicio: string, de: string, para: string, novaChave: string): Operacao[] {
  const alvo = lerIdNovo(id);
  if (!alvo) return operacoes;
  return operacoes.flatMap((op): Operacao[] => {
    if (op.chave !== alvo.chave || op.tipo !== "criar") return [op];
    const trocar = (ids: string[]) => (de === para ? ids : [...ids.filter((x) => x !== de), ...(ids.includes(para) ? [] : [para])]);
    const inicios = op.args.p_inicios.map((iso, i) => (i === alvo.indice ? novoInicio : iso));
    if (de === para || inicios.length === 1) {
      return [{ ...op, args: { ...op.args, p_inicios: inicios, p_profissionais: trocar(op.args.p_profissionais) } }];
    }
    const resto = op.args.p_inicios.filter((_, i) => i !== alvo.indice);
    const avulso: Operacao = {
      ...op,
      chave: novaChave,
      descricao: op.descricao.replace(/^Nova série/, "Novo"),
      args: { ...op.args, p_inicios: [novoInicio], p_profissionais: trocar(op.args.p_profissionais), p_frequencia: undefined, p_data_fim: undefined, p_sessoes: undefined },
    };
    return [{ ...op, args: { ...op.args, p_inicios: resto } }, avulso];
  });
}

// Descrições para a revisão ------------------------------------------------------

export function quando(data: string, minutos: number): string {
  return `${nomeCurtoDoDia(data)} ${data.slice(8, 10)}/${data.slice(5, 7)} ${formatarHora(minutos)}`;
}

const quandoIso = (iso: string) => {
  const p = partesNoFuso(iso);
  return quando(p.data, p.minutos);
};

const ALCANCE: Record<string, string> = { este: "", seguintes: " (este e os próximos da série)", todos: " (toda a série)" };

export function descreverCriacao(args: ArgsCriar, exibicao: Exibicao, profissionais: string): string {
  const n = args.p_inicios.length;
  const primeiro = quandoIso(args.p_inicios[0]);
  return n > 1
    ? `Nova série: ${exibicao.paciente ?? "—"} · ${n} atendimentos a partir de ${primeiro} · ${profissionais}`
    : `Novo: ${exibicao.paciente ?? "—"} · ${primeiro} · ${profissionais}`;
}

export function descreverMovimento(a: AtendimentoAgenda, novoInicio: string, profissionalNovo: string | null): string {
  return `Mover ${a.paciente ?? "atendimento"}: ${quando(a.data, a.inicio)} → ${quandoIso(novoInicio)}${profissionalNovo ? ` · ${profissionalNovo}` : ""}`;
}

export function descreverEdicao(a: AtendimentoAgenda, args: ArgsEditar): string {
  return `Editar ${a.paciente ?? "atendimento"} de ${quando(a.data, a.inicio)} → ${quando(args.p_data, hhmm(args.p_hora))}${ALCANCE[args.p_alcance]}`;
}

export function descreverDesmarcacao(a: AtendimentoAgenda, args: ArgsDesmarcar): string {
  return `Desmarcar ${a.paciente ?? "atendimento"} de ${quando(a.data, a.inicio)}${ALCANCE[args.p_alcance]} · ${args.p_motivo}`;
}

export function descreverExclusao(a: AtendimentoAgenda, args: ArgsExcluir): string {
  return `Excluir ${a.paciente ?? "atendimento"} de ${quando(a.data, a.inicio)}${ALCANCE[args.p_alcance]} · ${args.p_motivo}`;
}

/** Erro do banco ao aplicar ("CONFLITO <chave>" / "ERRO <chave>: <mensagem>") → operação e motivo. */
export function lerErroDeAplicacao(mensagem: string): { chave: string; motivo: string } | null {
  const conflito = /CONFLITO (\S+)/.exec(mensagem);
  if (conflito) return { chave: conflito[1], motivo: "A agenda real mudou depois desta alteração (horário, profissional ou status)." };
  const erro = /ERRO (\S+): (.*)/.exec(mensagem);
  return erro ? { chave: erro[1], motivo: erro[2] } : null;
}
