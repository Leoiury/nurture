import "server-only";
import { createClient } from "@/lib/supabase/server";

// Notificações: avisos (o que aconteceu, para a recepção e o ADM: exclusões feitas por
// profissionais) e pendências (o que está em aberto: guia perto do fim, devolutiva a
// marcar), calculadas no banco e resolvidas sozinhas.

export type Aviso = {
  id: string;
  tipo: "exclusao" | "ocultacao";
  criadoEm: string;
  autor: string | null;
  profissional: { id: string; nome: string } | null;
  paciente: { id: string; nome: string } | null;
  motivo: string | null;
  atendimentos: { id: string; inicio: string }[];
  lida: boolean;
};

export type MotivoDaDevolutiva = "faltas" | "atendimentos" | "mes";

export type Pendencia =
  | {
      tipo: "devolutiva";
      chave: string;
      paciente: { id: string; nome: string };
      profissionais: { id: string; nome: string }[];
      motivos: MotivoDaDevolutiva[];
      faltas: number;
      atendimentos: number;
      ultima: string | null;
    }
  | {
      tipo: "guia";
      chave: string;
      paciente: { id: string; nome: string };
      profissionais: { id: string; nome: string }[];
      plano: string | null;
      total: number;
      usadas: number;
      agendadas: number;
      restantes: number;
    };

/** Avisos dos últimos 90 dias. */
const JANELA_DOS_AVISOS = 90;

async function carregarPendencias(): Promise<Pendencia[]> {
  const supabase = await createClient();
  const [pendencias, profissionais] = await Promise.all([supabase.rpc("pendencias"), supabase.from("profissionais").select("id, nome")]);
  if (pendencias.error || profissionais.error) throw new Error("Não foi possível carregar as notificações.");
  const nome = new Map(profissionais.data.map((p) => [p.id, p.nome]));
  return pendencias.data
    .map((p) => {
      const comum = {
        chave: p.chave,
        paciente: { id: p.paciente_id, nome: p.paciente_nome },
        profissionais: p.profissionais
          .map((id) => ({ id, nome: nome.get(id) ?? "Profissional" }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      };
      const d = p.detalhe as Record<string, unknown>;
      return p.tipo === "guia"
        ? {
            ...comum,
            tipo: "guia" as const,
            plano: (d.plano as string | null) ?? null,
            total: Number(d.total),
            usadas: Number(d.usadas),
            agendadas: Number(d.agendadas),
            restantes: Number(d.restantes),
          }
        : {
            ...comum,
            tipo: "devolutiva" as const,
            motivos: (d.motivos as MotivoDaDevolutiva[]) ?? [],
            faltas: Number(d.faltas),
            atendimentos: Number(d.atendimentos),
            ultima: (d.ultima as string | null) ?? null,
          };
    })
    .sort((a, b) => a.paciente.nome.localeCompare(b.paciente.nome, "pt-BR"));
}

async function carregarAvisos(): Promise<Aviso[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - JANELA_DOS_AVISOS * 86_400_000).toISOString();
  // Para o profissional, o banco não devolve avisos.
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, tipo, criado_em, autor_nome, motivo, atendimentos, paciente:pacientes(id, nome), profissional:profissionais(id, nome), lidas:notificacoes_lidas(usuario_id)")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw new Error("Não foi possível carregar as notificações.");
  return data.map((n) => ({
    id: n.id,
    tipo: n.tipo as Aviso["tipo"],
    criadoEm: n.criado_em,
    autor: n.autor_nome,
    profissional: n.profissional,
    paciente: n.paciente,
    motivo: n.motivo,
    atendimentos: n.atendimentos as Aviso["atendimentos"],
    // As lidas só voltam as do próprio usuário (RLS).
    lida: n.lidas.length > 0,
  }));
}

export async function carregarNotificacoes() {
  const [pendencias, avisos] = await Promise.all([carregarPendencias(), carregarAvisos()]);
  return { pendencias, avisos };
}

/** Para a contagem no menu: pendências e avisos não lidos. */
export async function contarNotificacoes(): Promise<number> {
  const { pendencias, avisos } = await carregarNotificacoes();
  return pendencias.length + avisos.filter((a) => !a.lida).length;
}
