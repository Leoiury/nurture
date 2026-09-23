import type { Metadata } from "next";
import { carregarAgenda } from "@/lib/agenda/dados";
import { ehDataValida, hoje, inicioDaSemana, somarDias } from "@/lib/agenda/tempo";
import { AgendaGrade } from "./agenda-grade";
import { Navegacao } from "./navegacao";

export const metadata: Metadata = { title: "Agenda · Nurture" };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const params = await searchParams;
  const dataHoje = hoje();
  const dia = typeof params.dia === "string" && ehDataValida(params.dia) ? params.dia : null;
  const semanaParam = typeof params.semana === "string" && ehDataValida(params.semana) ? params.semana : null;
  const referencia = dia ?? semanaParam ?? dataHoje;
  const segunda = inicioDaSemana(referencia);

  const semana = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const { profissionais, atendimentos } = await carregarAgenda(semana[0], semana[6]);

  // Segunda a sexta sempre; fim de semana só se tiver atendimento.
  const dias = dia ? [dia] : semana.filter((d, i) => i < 5 || atendimentos.some((a) => a.data === d));

  return (
    <div className="flex flex-1 flex-col gap-3 px-3 py-4 sm:px-6">
      <Navegacao referencia={referencia} dia={dia} hoje={dataHoje} />
      <AgendaGrade
        key={dias.join()}
        modo={dia ? "dia" : "semana"}
        dias={dias}
        hoje={dataHoje}
        profissionais={profissionais}
        atendimentos={dia ? atendimentos.filter((a) => a.data === dia) : atendimentos}
      />
    </div>
  );
}
