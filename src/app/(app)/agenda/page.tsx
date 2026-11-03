import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { carregarAgenda, carregarAtendimentosCitados, carregarLembretes } from "@/lib/agenda/dados";
import { separarCalendarioPessoal } from "@/lib/agenda/pessoal";
import { sobreAtendimento, type Operacao } from "@/lib/agenda/planejamento";
import { ehDataValida, hoje, inicioDaSemana, partesNoFuso, somarDias } from "@/lib/agenda/tempo";
import { lerVisao, sufixoDaVisao, type Visao } from "@/lib/agenda/visao";
import { ehAdm as usuarioEhAdm, usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { AgendaGrade } from "./agenda-grade";
import { Navegacao } from "./navegacao";

export const metadata: Metadata = { title: "Agenda · Nurture" };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const params = await searchParams;
  const dataHoje = hoje();
  const dia = typeof params.dia === "string" && ehDataValida(params.dia) ? params.dia : null;
  const semanaParam = typeof params.semana === "string" && ehDataValida(params.semana) ? params.semana : null;
  // Calendário pessoal: só a própria coluna, com os dias lado a lado (colunas = dias).
  // É o único do perfil profissional; quem é ADM e também atende alterna com a agenda completa.
  const usuario = await usuarioAtual();
  const soPessoal = usuario?.perfil === "profissional";
  const visaoPedida = lerVisao(params.visao);
  const podeAlternar = !soPessoal && !!usuario?.profissionalId && params.planejamento !== "1";
  const pessoal = soPessoal || (podeAlternar && visaoPedida === "pessoal");
  const visao = soPessoal ? "lado" : visaoPedida === "pessoal" && !pessoal ? "empilhada" : visaoPedida;
  const referencia = dia ?? semanaParam ?? dataHoje;
  const segunda = inicioDaSemana(referencia);

  const supabase = await createClient();
  // Filtro por paciente vindo de fora (ex.: "Próximos atendimentos", na tela de atendimento).
  const pacienteDaUrl = typeof params.paciente === "string" && /^[0-9a-f-]{36}$/i.test(params.paciente) ? params.paciente : null;
  const pacienteFiltrado = pacienteDaUrl ? (await supabase.from("pacientes").select("id, nome").eq("id", pacienteDaUrl).maybeSingle()).data : null;
  const ehAdm = await usuarioEhAdm();
  const noPlanejamento = params.planejamento === "1";
  if (noPlanejamento && !ehAdm) redirect("/agenda");

  const semana = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const [{ profissionais: todosOsProfissionais, atendimentos: daSemana, especiais }, rascunho, lembretes] = await Promise.all([
    carregarAgenda(semana[0], semana[6]),
    noPlanejamento ? supabase.from("planejamento").select("operacoes").maybeSingle() : null,
    carregarLembretes(dataHoje, dia ?? semana[0], dia ?? semana[6]),
  ]);
  if (rascunho?.error) throw rascunho.error;
  const calendario = pessoal ? separarCalendarioPessoal(daSemana, usuario?.profissionalId ?? "", partesNoFuso(new Date().toISOString())) : null;
  const atendimentos = calendario?.meus ?? daSemana;
  const profissionais = pessoal ? todosOsProfissionais.filter((p) => p.id === usuario?.profissionalId) : todosOsProfissionais;
  const operacoes = (rascunho?.data?.operacoes ?? []) as unknown as Operacao[];

  // No planejamento, os atendimentos citados pelo rascunho podem estar em outra semana
  // (movidos para esta, ou de uma série alterada): entram na base da simulação.
  let base = atendimentos;
  if (noPlanejamento) {
    const citados = [...new Set(operacoes.flatMap((op) => (sobreAtendimento(op) ? [op.args.p_id] : [])))];
    const naSemana = new Set(atendimentos.map((a) => a.id));
    const extras = (await carregarAtendimentosCitados(citados.filter((id) => !naSemana.has(id)))).filter((a) => !naSemana.has(a.id));
    base = [...atendimentos, ...extras];
  }

  // Colunas do profissional com mais atendimentos na semana para o com menos
  // (desmarcados não contam; empate em ordem alfabética). Mesmo na visão de um
  // dia, a ordem segue o total da semana.
  const totalNaSemana = new Map<string, number>();
  for (const a of atendimentos) {
    if (a.status === "desmarcado") continue;
    for (const id of a.profissionalIds) totalNaSemana.set(id, (totalNaSemana.get(id) ?? 0) + 1);
  }
  const profissionaisOrdenados = profissionais.toSorted(
    (a, b) => (totalNaSemana.get(b.id) ?? 0) - (totalNaSemana.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  // Segunda a sexta sempre; fim de semana só se tiver atendimento.
  const dias = dia ? [dia] : semana.filter((d, i) => i < 5 || atendimentos.some((a) => a.data === d));

  // A página atual em cada visão, para o seletor de visualização.
  const periodo = dia ? `dia=${dia}` : semanaParam ? `semana=${semanaParam}` : "";
  const url = (v: Visao, planejamento: boolean) => {
    const q = `${periodo}${sufixoDaVisao(v, planejamento, pacienteFiltrado?.id)}`.replace(/^&/, "");
    return `/agenda${q ? `?${q}` : ""}`;
  };
  const urlDaVisao: Record<Visao, string> = {
    empilhada: url("empilhada", noPlanejamento),
    ampliada: url("ampliada", noPlanejamento),
    lado: url("lado", noPlanejamento),
    pessoal: url("pessoal", noPlanejamento),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-5">
      <AgendaGrade
        key={dias.join()}
        modo={dia ? "dia" : "semana"}
        visao={visao}
        urlDaVisao={urlDaVisao}
        dias={dias}
        hoje={dataHoje}
        profissionais={profissionaisOrdenados}
        atendimentos={dia ? atendimentos.filter((a) => a.data === dia) : atendimentos}
        especiais={especiais}
        lembretes={lembretes}
        pessoal={calendario ? { outros: calendario.outros } : undefined}
        pacienteFiltrado={pacienteFiltrado}
        planejamento={noPlanejamento ? { operacoes, base, urlSair: url(visao, false) } : undefined}
        urlDoPlanejamento={ehAdm && !noPlanejamento && !pessoal ? url(visao, true) : undefined}
        meuProfissional={usuario?.profissionalId && usuario.perfil !== "limitado" && !noPlanejamento ? usuario.profissionalId : undefined}
        alternarCalendario={podeAlternar ? (pessoal ? { href: url("empilhada", false), rotulo: "Agenda completa" } : { href: url("pessoal", false), rotulo: "Meu calendário" }) : undefined}
        navegacao={<Navegacao referencia={referencia} dia={dia} hoje={dataHoje} visao={visao} planejamento={noPlanejamento} paciente={pacienteFiltrado?.id} />}
        navegacaoNoMenu={<Navegacao referencia={referencia} dia={dia} hoje={dataHoje} visao={visao} planejamento={noPlanejamento} variante="menu" paciente={pacienteFiltrado?.id} />}
      />
    </div>
  );
}
