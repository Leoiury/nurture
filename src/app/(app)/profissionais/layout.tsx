import { redirect } from "next/navigation";
import { ehProfissional } from "@/lib/auth/usuario";

export default async function ProfissionaisLayout({ children }: LayoutProps<"/profissionais">) {
  // O perfil profissional só tem Calendário, Pacientes e Configurações.
  if (await ehProfissional()) redirect("/agenda");
  return children;
}
