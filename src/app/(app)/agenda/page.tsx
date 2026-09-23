import type { Metadata } from "next";
import { carregarAgenda } from "@/lib/agenda/dados";
import { ehDataValida, hoje, inicioDaSemana, somarDias } from "@/lib/agenda/tempo";
import { AgendaGrade } from "./agenda-grade";
import type { Visao } from "./comum";
import { Navegacao } from "./navegacao";

export const metadata: Metadata = { title: "Agenda · Nurture" };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const params = await searchParams;
  const dataHoje = hoje();
  const dia = typeof params.dia === "string" && ehDataValida(params.dia) ? params.dia : null;
  const semanaParam = typeof params.semana === "string" && ehDataValida(params.semana) ? params.semana : null;
  const visao: Visao = params.visao === "lado" ? "lado" : "empilhada";
  const referencia = dia ?? semanaParam ?? dataHoje;
  const segunda = inicioDaSemana(referencia);

  const semana = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const { profissionais, atendimentos } = await carregarAgenda(semana[0], semana[6]);

  // Colunas do profissional com mais atendimentos na semana para o com menos
  // (desmarcados não contam; empate em ordem alfabética). Mesmo na visão de um
  // dia, a ordem segue o total da semana.
  const totalNaSemana = new Map<string, number>();
  for (const a of atendimentos) {
    if (a.status !== "desmarcado") totalNaSemana.set(a.profissionalId, (totalNaSemana.get(a.profissionalId) ?? 0) + 1);
  }
  const profissionaisOrdenados = profissionais.toSorted(
    (a, b) => (totalNaSemana.get(b.id) ?? 0) - (totalNaSemana.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  // Segunda a sexta sempre; fim de semana só se tiver atendimento.
  const dias = dia ? [dia] : semana.filter((d, i) => i < 5 || atendimentos.some((a) => a.data === d));

  // A página atual em cada visão, para o seletor de visualização.
  const base = dia ? `dia=${dia}` : semanaParam ? `semana=${semanaParam}` : "";
  const urlDaVisao: Record<Visao, string> = {
    empilhada: `/agenda${base ? `?${base}` : ""}`,
    lado: `/agenda?${base ? `${base}&` : ""}visao=lado`,
  };

  return (
    <div className="flex flex-1 flex-col px-3 py-4 sm:px-6 sm:py-5">
      <AgendaGrade
        key={dias.join()}
        modo={dia ? "dia" : "semana"}
        visao={visao}
        urlDaVisao={urlDaVisao}
        dias={dias}
        hoje={dataHoje}
        profissionais={profissionaisOrdenados}
        atendimentos={dia ? atendimentos.filter((a) => a.data === dia) : atendimentos}
        navegacao={<Navegacao referencia={referencia} dia={dia} hoje={dataHoje} visao={visao} />}
      />
    </div>
  );
}
