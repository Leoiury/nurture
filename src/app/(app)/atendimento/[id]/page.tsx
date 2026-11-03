import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { situacaoDaGuia } from "@/lib/agenda/guias";
import { ATENDIMENTOS_SEM_VALOR } from "@/lib/agenda/sem-valor";
import { conteudoVazio, sincronizarTopicos, type ConteudoDoRegistro, type ModeloDoRegistro } from "@/lib/atendimento/conteudo";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { detalhesAtendimento } from "../../agenda/actions";
import { guiaDoAtendimento } from "../../agenda/actions-guias";
import { LeituraDosRegistros, type RegistroParaLer } from "./leitura";
import { TelaDoAtendimento } from "./tela";

export const metadata: Metadata = { title: "Atendimento · Nurture" };

export default async function AtendimentoPage({ params, searchParams }: PageProps<"/atendimento/[id]">) {
  const { id } = await params;
  const { editar, profissional, versao, finalizado } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const eu = await usuarioAtual();
  const [atendimento, registros] = await Promise.all([
    supabase
      .from(ATENDIMENTOS_SEM_VALOR)
      .select("id, inicio, fim, status, tipo:tipos_atendimento(abre_anamnese), paciente:pacientes(id, nome), profissionais:atendimento_profissionais(profissional:profissionais(id, nome))")
      .eq("id", id)
      .is("excluido_em", null)
      .maybeSingle(),
    supabase
      .from("registros_atendimento")
      .select("id, profissional_id, conteudo, versao, profissional:profissionais(nome), versoes:registros_versoes(versao, conteudo, salva_em)")
      .eq("atendimento_id", id),
  ]);
  if (atendimento.error || registros.error) throw new Error("Não foi possível carregar o atendimento.");
  const a = atendimento.data;
  if (!a?.paciente) notFound();

  const participa = !!eu?.profissionalId && a.profissionais.some((p) => p.profissional.id === eu.profissionalId);
  const meu = registros.data.find((r) => r.profissional_id === eu?.profissionalId);
  // Registro já salvo continua aberto, caso o tipo tenha mudado depois.
  if (a.tipo?.abre_anamnese && participa && !meu?.versao) redirect(`/anamnese?atendimento=${id}`);
  const paciente = a.paciente;
  const cabecalho = { paciente, inicio: a.inicio, fim: a.fim };

  // Escrevendo: quem atende, sem versão salva ou pedindo para editar.
  if (participa && (!meu || meu.versao === 0 || editar === "1")) {
    const [detalhes, guia, rascunho, preferencia, modelo] = await Promise.all([
      detalhesAtendimento(id),
      guiaDoAtendimento(id),
      meu ? supabase.from("registros_rascunhos").select("conteudo").eq("registro_id", meu.id).maybeSingle() : null,
      supabase.from("usuarios").select("modelo_atendimento").eq("id", eu!.id).single(),
      supabase.from("atendimento_topicos").select("id, texto").order("ordem"),
    ]);
    if (rascunho?.error || preferencia.error || modelo.error) throw new Error("Não foi possível carregar o registro.");

    const salvo = meu && meu.versao > 0 ? (meu.conteudo as unknown as ConteudoDoRegistro) : null;
    const emAndamento = rascunho?.data?.conteudo as unknown as ConteudoDoRegistro | undefined;
    const base = emAndamento ?? salvo ?? conteudoVazio(preferencia.data.modelo_atendimento as ModeloDoRegistro, modelo.data);
    // Ainda não salvo: acompanha o modelo. Depois de salvo, os tópicos não mudam mais.
    const conteudo = salvo ? base : sincronizarTopicos(base, modelo.data);

    return (
      <TelaDoAtendimento
        id={id}
        cabecalho={cabecalho}
        guia={situacaoDaGuia(guia.atual, guia.exigeGuia, a.status)}
        sessaoDaGuia={guia.atual ? { posicao: guia.atual.posicao, quantidade: guia.atual.quantidade } : null}
        detalhes={detalhes}
        conteudoInicial={conteudo}
        versao={meu?.versao ?? 0}
        statusAtual={a.status}
        profissional={a.profissionais.find((p) => p.profissional.id === eu?.profissionalId)?.profissional.nome ?? ""}
      />
    );
  }

  // Leitura: os registros salvos de cada profissional, com as versões.
  const salvos: RegistroParaLer[] = registros.data
    .filter((r) => r.versao > 0)
    .map((r) => ({
      profissionalId: r.profissional_id,
      profissional: r.profissional.nome,
      versaoAtual: r.versao,
      versoes: r.versoes.map((v) => ({ versao: v.versao, conteudo: v.conteudo as unknown as ConteudoDoRegistro, salvaEm: v.salva_em })).sort((x, y) => y.versao - x.versao),
    }));
  return (
    <LeituraDosRegistros
      id={id}
      cabecalho={cabecalho}
      registros={salvos}
      profissionalInicial={typeof profissional === "string" ? profissional : (meu?.profissional_id ?? null)}
      versaoInicial={typeof versao === "string" ? Number(versao) : null}
      podeEditar={participa}
      acabouDeFinalizar={finalizado === "1"}
      meuProfissional={eu?.profissionalId ?? null}
    />
  );
}
