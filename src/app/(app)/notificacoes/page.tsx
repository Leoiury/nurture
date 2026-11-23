import type { Metadata } from "next";
import { ehProfissional } from "@/lib/auth/usuario";
import { tipoDevolutiva } from "./actions";
import { carregarNotificacoes } from "./dados";
import { ListaDeNotificacoes } from "./lista-de-notificacoes";

export const metadata: Metadata = { title: "Notificações · Nurture" };

export default async function NotificacoesPage() {
  const [{ pendencias, avisos }, profissional, devolutiva] = await Promise.all([carregarNotificacoes(), ehProfissional(), tipoDevolutiva()]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
        <p className="text-sm text-muted">
          {profissional
            ? "Guias perto do fim e devolutivas a marcar dos seus pacientes."
            : "Guias perto do fim, devolutivas a marcar e as exclusões feitas pelos profissionais."}
        </p>
      </header>
      <ListaDeNotificacoes pendencias={pendencias} avisos={avisos} profissional={profissional} tipoDevolutiva={devolutiva} />
    </div>
  );
}
