import Link from "next/link";
import type { Metadata } from "next";
import { ehProfissional, usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { ListaDePacientes, type PacienteDaLista } from "./lista-de-pacientes";

export const metadata: Metadata = { title: "Pacientes · Nurture" };

const LISTA = "id, nome, responsavel, data_nascimento, celular, ativo, nivel_cadastral, pendencias_cadastrais, plano:planos(nome, cor)";
// A mesma lista para o perfil profissional, sem acesso à tabela de planos.
const LISTA_SEM_VALOR = "id, nome, responsavel, data_nascimento, celular, ativo, nivel_cadastral, pendencias_cadastrais, plano:planos_equipe(nome, cor)" as typeof LISTA;

export default async function PacientesPage({ searchParams }: PageProps<"/pacientes">) {
  const { visao } = await searchParams;
  const supabase = await createClient();
  const eu = await usuarioAtual();
  const semPlano = await ehProfissional();
  const { data, error } = await supabase
    .from("pacientes")
    .select(semPlano ? LISTA_SEM_VALOR : LISTA)
    .order("nome")
    .limit(5000);
  if (error) throw new Error("Não foi possível carregar os pacientes.");

  const pacientes: PacienteDaLista[] = data.map((p) => ({
    id: p.id,
    nome: p.nome,
    responsavel: p.responsavel,
    dataNascimento: p.data_nascimento,
    celular: p.celular,
    ativo: p.ativo,
    plano: semPlano ? null : p.plano,
    nivel: p.nivel_cadastral,
    pendencias: semPlano ? p.pendencias_cadastrais.filter((x) => x !== "plano") : p.pendencias_cadastrais,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      {eu?.profissionalId && eu.perfil !== "limitado" && (
        <Link href="/anamnese" className="self-end rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Nova anamnese
        </Link>
      )}
      <ListaDePacientes pacientes={pacientes} visao={visao === "cadastro" ? "cadastro" : "lista"} semPlano={semPlano} />
    </div>
  );
}
