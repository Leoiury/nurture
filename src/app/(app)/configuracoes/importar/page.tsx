import type { Metadata } from "next";
import { ehAdm } from "@/lib/auth/usuario";
import { ImportarAgenda } from "./importar-agenda";

export const metadata: Metadata = { title: "Importar agenda · Nurture" };

export default async function ImportarPage() {
  if (!(await ehAdm())) return <p className="text-sm text-muted">Apenas a direção pode importar a agenda.</p>;
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
