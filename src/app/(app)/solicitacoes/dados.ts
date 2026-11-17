import "server-only";
import { createClient } from "@/lib/supabase/server";

// Pedidos dos profissionais à espera da recepção ou de um ADM: exclusão de atendimentos
// e inativação de pacientes. Os atendimentos de um pedido de inativação aparecem dentro
// dele, e não como um pedido de exclusão à parte.

export type AtendimentoDoPedido = { id: string; inicio: string; recorrenciaId: string | null };

export type Solicitacao = {
  /** Estável entre recargas: serve de chave e de alvo das ações. */
  chave: string;
  tipo: "exclusao" | "inativacao";
  /** Só na inativação. */
  pedidoId: string | null;
  paciente: { id: string; nome: string };
  profissional: { id: string; nome: string } | null;
  pedidoPor: string | null;
  pedidoEm: string;
  motivo: string;
  atendimentos: AtendimentoDoPedido[];
};

const instante = (t: string) => new Date(t).getTime();

export async function carregarSolicitacoes(): Promise<Solicitacao[]> {
  const supabase = await createClient();
  const [inativacoes, exclusoes] = await Promise.all([
    supabase
      .from("inativacoes_pedidas")
      .select("id, pedido_por, pedido_por_nome, motivo, pedido_em, paciente:pacientes(id, nome), profissional:profissionais(id, nome)")
      .is("decisao", null),
    supabase
      .from("atendimentos")
      .select("id, inicio, recorrencia_id, exclusao_solicitada_em, exclusao_solicitada_por, exclusao_motivo, paciente:pacientes(id, nome), profissionais:atendimento_profissionais(profissional:profissionais(id, nome))")
      .is("excluido_em", null)
      .not("exclusao_solicitada_em", "is", null)
      .order("inicio")
      .limit(5000),
  ]);
  if (inativacoes.error || exclusoes.error) throw new Error("Não foi possível carregar as solicitações.");

  const lista: Solicitacao[] = inativacoes.data.map((p) => ({
    chave: `inativacao:${p.id}`,
    tipo: "inativacao",
    pedidoId: p.id,
    paciente: p.paciente,
    profissional: p.profissional,
    pedidoPor: p.pedido_por_nome,
    pedidoEm: p.pedido_em,
    motivo: p.motivo,
    atendimentos: [],
  }));
  // Pedido de inativação de cada (quem pediu, instante, paciente), para encaixar os atendimentos.
  const daInativacao = new Map(inativacoes.data.map((p, i) => [`${p.pedido_por}|${instante(p.pedido_em)}|${p.paciente.id}`, lista[i]]));

  // Um pedido de exclusão: o mesmo profissional, no mesmo instante, para o mesmo paciente
  // (uma série inteira ou vários atendimentos de uma vez pelo menu do paciente).
  const pedidos = new Map<string, Solicitacao>();
  for (const a of exclusoes.data) {
    if (!a.paciente) continue;
    const chave = `${a.exclusao_solicitada_por}|${instante(a.exclusao_solicitada_em!)}|${a.paciente.id}`;
    const atendimento = { id: a.id, inicio: a.inicio, recorrenciaId: a.recorrencia_id };
    const destino = daInativacao.get(chave) ?? pedidos.get(chave);
    if (destino) {
      destino.atendimentos.push(atendimento);
      continue;
    }
    pedidos.set(chave, {
      chave: `exclusao:${a.id}`,
      tipo: "exclusao",
      pedidoId: null,
      paciente: a.paciente,
      profissional: a.profissionais[0]?.profissional ?? null,
      pedidoPor: null,
      pedidoEm: a.exclusao_solicitada_em!,
      motivo: a.exclusao_motivo ?? "",
      atendimentos: [atendimento],
    });
  }
  return [...lista, ...pedidos.values()].sort((a, b) => instante(b.pedidoEm) - instante(a.pedidoEm));
}

/** Um atendimento de cada série do pedido: as funções de exclusão agem por série. */
export function representantes(atendimentos: AtendimentoDoPedido[]): string[] {
  const vistos = new Set<string>();
  return atendimentos.filter((a) => {
    const serie = a.recorrenciaId ?? a.id;
    if (vistos.has(serie)) return false;
    vistos.add(serie);
    return true;
  }).map((a) => a.id);
}
