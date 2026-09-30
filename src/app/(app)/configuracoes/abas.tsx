"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/configuracoes/planos", rotulo: "Planos" },
  { href: "/configuracoes/tipos", rotulo: "Tipos de atendimento" },
  { href: "/configuracoes/feriados", rotulo: "Feriados e recessos" },
  { href: "/configuracoes/datas", rotulo: "Datas comemorativas" },
  { href: "/configuracoes/importar", rotulo: "Importar agenda" },
  { href: "/configuracoes/usuarios", rotulo: "Usuários" },
] as const;

export function AbasDeConfiguracao() {
  const caminho = usePathname();
  return (
    <nav aria-label="Seções de configuração" className="flex max-w-full flex-wrap gap-0.5 self-start rounded-2xl bg-black/[0.04] p-1">
      {ABAS.map((a) => {
        const ativa = caminho.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm transition ${ativa ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
