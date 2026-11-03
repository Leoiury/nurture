import { redirect } from "next/navigation";
import { podeVerClinico } from "@/lib/auth/usuario";

export default async function AnamneseLayout({ children }: LayoutProps<"/anamnese">) {
  // Conteúdo clínico: a recepção não acessa (o banco também bloqueia).
  if (!(await podeVerClinico())) redirect("/agenda");
  return children;
}
