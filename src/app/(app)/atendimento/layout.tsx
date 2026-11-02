import { redirect } from "next/navigation";
import { podeVerClinico } from "@/lib/auth/usuario";

export default async function AtendimentoLayout({ children }: LayoutProps<"/atendimento">) {
  // Conteúdo clínico: a recepção não acessa (o banco também bloqueia).
  if (!(await podeVerClinico())) redirect("/agenda");
  return children;
}
