import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ImportarAgenda } from "./importar-agenda";

export const metadata: Metadata = { title: "Importar agenda · Nurture" };

export default async function ImportarPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const perfil = (data?.claims.app_metadata as { perfil?: string } | undefined)?.perfil;
  if (perfil !== "direcao" && perfil !== "dev") {
    return <p className="text-sm text-muted">Apenas a direção pode importar a agenda.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Envie o relatório de agendamentos do sistema anterior (.xlsx, um ou vários meses). Os atendimentos são casados pelo ID do sistema
        anterior: os novos entram, os que mudaram lá são atualizados e os apagados lá são excluídos aqui. Atendimentos já modificados no
        app ficam como estão no app.
      </p>
      <ImportarAgenda />
    </div>
  );
}
