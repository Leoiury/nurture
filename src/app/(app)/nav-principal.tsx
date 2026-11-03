"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/agenda", rotulo: "Agenda" },
  { href: "/pacientes", rotulo: "Pacientes" },
  { href: "/profissionais", rotulo: "Profissionais" },
];

const ITENS_PROFISSIONAL = [
  { href: "/agenda", rotulo: "Calendário" },
  { href: "/pacientes", rotulo: "Pacientes" },
  { href: "/conta", rotulo: "Configurações" },
];

// Financeiro: só a direção.
const ITENS_ADM = [{ href: "/financeiro", rotulo: "Financeiro" }];

export function NavPrincipal({ perfil }: { perfil: "adm" | "limitado" | "profissional" }) {
  const caminho = usePathname();
  return (
    // No celular, se não couber, só o menu rola (não a página).
    <nav className="flex min-w-0 gap-3 overflow-x-auto text-sm whitespace-nowrap sm:gap-4">
      {(perfil === "profissional" ? ITENS_PROFISSIONAL : perfil === "adm" ? [...ITENS, ...ITENS_ADM] : ITENS).map((i) => {
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
