import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";
import { EditorDoModelo } from "../../anamnese/editar/editor";

export const metadata: Metadata = { title: "Editar tópicos · Nurture" };

export default async function ModeloDoAtendimentoPage({ searchParams }: PageProps<"/atendimento/modelo">) {
  const { voltar } = await searchParams;
  const eu = await usuarioAtual();
  if (!eu?.profissionalId) redirect("/agenda");

  const supabase = await createClient();
  const { data, error } = await supabase.from("atendimento_topicos").select("id, texto").order("ordem");
  if (error) throw new Error("Não foi possível carregar os tópicos.");

  // Só caminhos internos: o endereço vem da URL.
  const destino = typeof voltar === "string" && /^\/(atendimento\/[0-9a-f-]+(\?editar=1)?|conta)$/i.test(voltar) ? voltar : "/conta";
  return <EditorDoModelo modelo="atendimento" perguntasIniciais={data} voltar={destino} />;
}
