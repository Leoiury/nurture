import type { Metadata } from "next";
import { ehAdm } from "@/lib/auth/usuario";

export const metadata: Metadata = { title: "Financeiro · Nurture" };

export default async function FinanceiroLayout({ children }: LayoutProps<"/financeiro">) {
  // Só a direção (o banco também só deixa a direção ler e alterar o financeiro).
  if (!(await ehAdm())) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p className="text-sm text-muted">O financeiro é restrito à direção.</p>
      </div>
    );
  }
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">{children}</div>;
}
