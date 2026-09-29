"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/pacientes", rotulo: "Pacientes" },
  { href: "/profissionais", rotulo: "Profissionais" },
];

export function NavPrincipal() {
  const caminho = usePathname();
  return (
    // No celular, se não couber, só o menu rola (não a página).
    <nav className="flex min-w-0 gap-3 overflow-x-auto text-sm whitespace-nowrap sm:gap-4">
      {ITENS.map((i) => {
        const ativo = caminho === i.href || caminho.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativo ? "page" : undefined}
            className={ativo ? "font-medium text-accent" : "text-muted hover:text-foreground"}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
