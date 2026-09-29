import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ListaDeProfissionais, type ProfissionalDaLista } from "./lista-de-profissionais";

export const metadata: Metadata = { title: "Profissionais · Nurture" };

export default async function ProfissionaisPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profissionais")
    .select("id, nome, especialidade, registro, celular, email, ativo")
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) throw new Error("Não foi possível carregar os profissionais.");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      <ListaDeProfissionais profissionais={data satisfies ProfissionalDaLista[]} />
    </div>
  );
}
