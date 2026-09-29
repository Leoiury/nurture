import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/lib/auth/actions";
import { usuarioAtual } from "@/lib/auth/usuario";
import { NavPrincipal } from "./nav-principal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  if (!usuario.ativo) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">Seu acesso foi desativado.</p>
        <p className="text-sm text-muted">Fale com a direção da clínica.</p>
        <form action={sair}>
          <button type="submit" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white">
            Sair
          </button>
        </form>
      </div>
    );
  }

  return (
    // Altura fixa da janela: as páginas ocupam o espaço restante (a agenda se ajusta a ele).
    <div className="flex h-dvh flex-col">
      <header data-cabecalho-app className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          {/* No celular, o nome some para o menu caber ("Agenda" leva ao mesmo lugar). */}
          <Link href="/agenda" className="hidden text-lg font-semibold tracking-tight sm:inline">
            Nurture
          </Link>
          <NavPrincipal />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/conta" title="Minha conta" className="hidden text-muted hover:text-foreground sm:inline">
            {usuario.nome}
          </Link>
          {/* No celular, só o ícone. */}
          <Link href="/conta" aria-label="Minha conta" className="rounded-md p-1.5 text-muted/70 hover:bg-background hover:text-foreground sm:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="5.5" r="2.7" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2.8 13.5c.8-2.4 2.8-3.7 5.2-3.7s4.4 1.3 5.2 3.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </Link>
          {/* Configurações (só ADM) são pouco usadas: só um ícone discreto. */}
          {usuario.perfil === "adm" && (
            <Link
              href="/configuracoes/planos"
              title="Configurações: planos, tipos de atendimento, feriados e recessos, importar agenda, usuários"
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
          )}
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
