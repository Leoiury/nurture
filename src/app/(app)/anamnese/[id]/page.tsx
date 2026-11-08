import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sincronizarComModelo, type ItemDaAnamnese } from "@/lib/anamnese/conteudo";
import { FUSO } from "@/lib/agenda/tempo";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { BotaoDeArquivos } from "../../arquivos/botao-de-arquivos";
import { carregarArquivos } from "../../arquivos/dados";
import { CabecalhoDaAnamnese } from "../cabecalho";
import { FormularioDaAnamnese } from "../formulario";

export const metadata: Metadata = { title: "Anamnese · Nurture" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AnamneseDetalhePage({ params, searchParams }: PageProps<"/anamnese/[id]">) {
  const { id } = await params;
  const { editar, versao: versaoPedida } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [eu, anamnese, versoes, rascunho] = await Promise.all([
    usuarioAtual(),
    supabase
      .from("anamneses")
      .select("id, titulo, conteudo, observacoes, versao, salva_em, profissional_id, paciente:pacientes(id, nome), profissional:profissionais(nome)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("anamneses_versoes").select("versao, conteudo, observacoes, salva_em").eq("anamnese_id", id).order("versao", { ascending: false }),
    supabase.from("anamneses_rascunhos").select("conteudo, observacoes").eq("anamnese_id", id).maybeSingle(),
  ]);
  if (anamnese.error || versoes.error || rascunho.error) throw new Error("Não foi possível carregar a anamnese.");
  const a = anamnese.data;
  if (!a) notFound();

  const ehAutor = !!eu?.profissionalId && a.profissional_id === eu.profissionalId;
  const paciente = a.paciente;
  const arquivos = await carregarArquivos(paciente.id);

  // Preenchendo: em andamento, ou o autor pediu para editar uma salva.
  if (ehAutor && (!a.salva_em || editar === "1")) {
    const base = (rascunho.data?.conteudo ?? a.conteudo) as unknown as ItemDaAnamnese[];
    let itens = base;
    if (!a.salva_em) {
      // Ainda não salva: acompanha o modelo. Depois de salva, as perguntas não mudam mais.
      const { data: modelo, error } = await supabase.from("anamnese_perguntas").select("id, texto").order("ordem");
      if (error) throw new Error("Não foi possível carregar as perguntas.");
      itens = sincronizarComModelo(base, modelo);
    }
    return <FormularioDaAnamnese id={a.id} titulo={a.titulo} paciente={paciente} itensIniciais={itens} observacoesIniciais={rascunho.data?.observacoes ?? a.observacoes} versao={a.versao} arquivos={arquivos} />;
  }

  // Leitura: a última versão, ou a escolhida no histórico.
  const numero = typeof versaoPedida === "string" ? Number(versaoPedida) : a.versao;
  const exibida = versoes.data.find((v) => v.versao === numero) ?? versoes.data[0];
  if (!exibida) notFound();
  const itens = exibida.conteudo as unknown as ItemDaAnamnese[];
  const antiga = exibida.versao !== a.versao;

  return (
    <>
      <CabecalhoDaAnamnese
        pacienteId={paciente.id}
        voltarDoModelo={`/anamnese/${a.id}`}
        comModelo={!!eu?.profissionalId}
        arquivos={<BotaoDeArquivos paciente={paciente} origem={{ anamneseId: a.id }} arquivos={arquivos} />}
      >
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          {a.titulo} de {a.profissional.nome} · {dataHora.format(new Date(exibida.salva_em))}
        </p>
        <Link href={`/pacientes/${paciente.id}`} className="block truncate text-lg font-semibold tracking-tight hover:text-accent">
          {paciente.nome}
        </Link>
      </CabecalhoDaAnamnese>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        {antiga && (
          <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Versão {exibida.versao} de {a.versao}.{" "}
            <Link href={`/anamnese/${a.id}`} className="font-semibold underline underline-offset-2">
              Ver a atual
            </Link>
          </p>
        )}
        {itens.map((item) => (
          <section key={item.perguntaId} className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="font-semibold">{item.pergunta}</h2>
            <p className="text-sm whitespace-pre-wrap">{item.resposta || <span className="text-muted">Sem resposta.</span>}</p>
          </section>
        ))}
        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">Observações</h2>
          <p className="text-sm whitespace-pre-wrap">{exibida.observacoes || <span className="text-muted">Sem observações.</span>}</p>
        </section>

        {ehAutor && (
          <Link href={`/anamnese/${a.id}?editar=1`} className="self-start rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition hover:brightness-110">
            {rascunho.data ? "Continuar edição" : "Editar"}
          </Link>
        )}

        <section aria-label="Histórico de versões" className="flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">Histórico de versões</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {versoes.data.map((v) => (
              <li key={v.versao}>
                <Link
                  href={v.versao === a.versao ? `/anamnese/${a.id}` : `/anamnese/${a.id}?versao=${v.versao}`}
                  aria-current={v.versao === exibida.versao ? "page" : undefined}
                  className={`flex justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-background ${v.versao === exibida.versao ? "bg-accent-soft font-medium text-accent" : ""}`}
                >
                  <span>Versão {v.versao}{v.versao === a.versao ? " (atual)" : ""}</span>
                  <span className="tabular-nums">{dataHora.format(new Date(v.salva_em))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
