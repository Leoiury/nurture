import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
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
          <form action={sair}>
            <button type="submit" className="rounded-md px-2 py-1 text-muted hover:bg-background hover:text-foreground">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
