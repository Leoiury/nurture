import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ListaDeTipos, type TipoDaLista } from "./lista-de-tipos";

export const metadata: Metadata = { title: "Tipos de atendimento · Nurture" };

export default async function TiposPage() {
  const supabase = await createClient();
  const [tipos, profissionais] = await Promise.all([
    supabase
      .from("tipos_atendimento")
      .select("id, nome, ativo, atendimentos(count), vinculos:tipos_atendimento_profissionais(profissional_id)")
      .order("ativo", { ascending: false })
      .order("nome"),
    supabase.from("profissionais").select("id, nome, especialidade").eq("ativo", true).order("nome"),
  ]);
  if (tipos.error || profissionais.error) throw new Error("Não foi possível carregar os tipos.");

  const lista: TipoDaLista[] = tipos.data.map((t) => ({
    id: t.id,
    nome: t.nome,
    ativo: t.ativo,
    atendimentos: t.atendimentos[0]?.count ?? 0,
    profissionais: t.vinculos.map((v) => v.profissional_id),
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        O tipo diz o que é o atendimento (sessão, avaliação, reunião…). Quem atende cada tipo orienta a sugestão do tipo ao escolher o
        profissional e a busca de horários livres; sem ninguém marcado, qualquer profissional atende.
      </p>
      <ListaDeTipos tipos={lista} profissionais={profissionais.data} />
    </div>
  );
}
