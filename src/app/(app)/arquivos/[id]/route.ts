import { NextResponse } from "next/server";
import { BUCKET_DE_ARQUIVOS, ehPdf } from "@/lib/arquivos";
import { podeVerClinico } from "@/lib/auth/usuario";
import { createClient } from "@/lib/supabase/server";

/** Abre um arquivo do paciente: PDF no navegador, Word como download, por um link que vale 1 minuto. */
export async function GET(_request: Request, { params }: RouteContext<"/arquivos/[id]">) {
  const { id } = await params;
  const naoEncontrado = new NextResponse("Arquivo não encontrado.", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await podeVerClinico())) return naoEncontrado;

  const supabase = await createClient();
  const { data: arquivo } = await supabase.from("arquivos_paciente").select("nome, tipo_mime, caminho").eq("id", id).maybeSingle();
  if (!arquivo) return naoEncontrado;
  const { data, error } = await supabase.storage.from(BUCKET_DE_ARQUIVOS).createSignedUrl(arquivo.caminho, 60);
  if (error || !data) return naoEncontrado;

  // O nome vai à mão: a opção "download" da biblioteca codifica duas vezes, e o acento vira "%C3%B3".
  const destino = new URL(data.signedUrl);
  if (!ehPdf(arquivo.tipo_mime)) destino.searchParams.set("download", arquivo.nome);
  const resposta = NextResponse.redirect(destino);
  resposta.headers.set("Cache-Control", "no-store");
  resposta.headers.set("Referrer-Policy", "no-referrer");
  return resposta;
}
