"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/pacientes", rotulo: "Pacientes" },
];

export function NavPrincipal() {
  const caminho = usePathname();
  return (
    <nav className="flex gap-4 text-sm">
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
