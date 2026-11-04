import type { Metadata } from "next";
import { dadosDoLink } from "@/lib/auth/convite";
import { FormDoCadastro } from "./form-do-cadastro";
import { FormDaSenha } from "./form-da-senha";

// O link é a credencial: fora dos buscadores e do cabeçalho Referer.
export const metadata: Metadata = { title: "Acesso · Nurture", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function CadastroPage({ params }: PageProps<"/cadastro/[token]">) {
  const { token } = await params;
  const link = await dadosDoLink(token);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Nurture</h1>
        {link?.tipo === "login" && <FormDoCadastro token={token} profissional={link.nome} emailDoCadastro={link.email} />}
        {link?.tipo === "senha" && <FormDaSenha token={token} profissional={link.nome} login={link.login} />}
        {!link && (
          <div role="alert" className="mt-4 flex flex-col gap-2 text-sm">
            <p className="font-medium">Este link não vale mais.</p>
            <p className="text-muted">Ele pode já ter sido usado, ter vencido ou ter sido trocado por outro. Peça um novo à clínica.</p>
          </div>
        )}
      </div>
    </main>
  );
}
