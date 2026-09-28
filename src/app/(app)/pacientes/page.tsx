import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ListaDePacientes, type PacienteDaLista } from "./lista-de-pacientes";

export const metadata: Metadata = { title: "Pacientes · Nurture" };

export default async function PacientesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, nome, responsavel, data_nascimento, celular, ativo, plano:planos(nome, cor)")
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
    plano: p.plano,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      <ListaDePacientes pacientes={pacientes} />
    </div>
  );
}
