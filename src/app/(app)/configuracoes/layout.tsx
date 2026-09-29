import Link from "next/link";
import { ehAdm } from "@/lib/auth/usuario";
import { AbasDeConfiguracao } from "./abas";

export default async function ConfiguracoesLayout({ children }: LayoutProps<"/configuracoes">) {
  const adm = await ehAdm();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3">
        <Link href="/agenda" className="text-sm text-muted hover:text-foreground">
          ← Agenda
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        {adm && <AbasDeConfiguracao />}
      </div>
      {/* Só ADM (o banco também só deixa ADM alterar estes cadastros). */}
      {adm ? children : <p className="text-sm text-muted">As configurações são restritas aos administradores.</p>}
    </div>
  );
}
