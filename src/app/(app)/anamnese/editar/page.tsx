import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { EditorDoModelo } from "./editor";

export const metadata: Metadata = { title: "Editar anamnese · Nurture" };

export default async function EditarAnamnesePage({ searchParams }: PageProps<"/anamnese/editar">) {
  const { voltar } = await searchParams;
  const eu = await usuarioAtual();
  if (!eu?.profissionalId) redirect("/anamnese");

  const supabase = await createClient();
  const { data, error } = await supabase.from("anamnese_perguntas").select("id, texto").order("ordem");
  if (error) throw new Error("Não foi possível carregar as perguntas.");

  // Só caminhos internos desta área ou da conta: o endereço vem da URL.
  const destino = typeof voltar === "string" && /^\/(anamnese|conta)(\/[0-9a-f-]*)?$/i.test(voltar) ? voltar : "/conta";
  return <EditorDoModelo perguntasIniciais={data} voltar={destino} />;
}
