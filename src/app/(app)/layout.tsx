import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    // Altura fixa da janela: as páginas ocupam o espaço restante (a agenda se ajusta a ele).
    <div className="flex h-dvh flex-col">
      <header data-cabecalho-app className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/agenda" className="text-lg font-semibold tracking-tight">
            Nurture
          </Link>
          <nav className="text-sm">
            <Link href="/agenda" className="font-medium text-accent">
              Agenda
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{data.claims.email}</span>
          {/* Configurações são pouco usadas: só um ícone discreto. */}
          <Link
            href="/configuracoes/planos"
            title="Configurações: planos, feriados e recessos"
            aria-label="Configurações"
            className="rounded-md p-1.5 text-muted/70 hover:bg-background hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Zm5.3-1.4.9.7-1 1.8-1.1-.3a4.7 4.7 0 0 1-1.3.8L10.6 13H8.5l-.2-1.2a4.7 4.7 0 0 1-1.3-.8l-1.1.3-1-1.8.9-.7a4.8 4.8 0 0 1 0-1.6l-.9-.7 1-1.8 1.1.3c.4-.3.8-.6 1.3-.8L7.5 3h2.1l.2 1.2c.5.2.9.5 1.3.8l1.1-.3 1 1.8-.9.7a4.8 4.8 0 0 1 0 1.6Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <form action={sair}>
            <button type="submit" className="rounded-md px-2 py-1 text-muted hover:bg-background hover:text-foreground">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</main>
    </div>
  );
}
