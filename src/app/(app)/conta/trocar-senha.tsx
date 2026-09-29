"use client";

import { useActionState } from "react";
import { trocarSenha } from "@/lib/auth/actions";

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function TrocarSenha() {
  const [estado, acao, enviando] = useActionState(trocarSenha, undefined);
  return (
    <section aria-label="Trocar senha" className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-3 font-semibold">Trocar senha</h2>
      <form action={acao} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">Nova senha</span>
          <input name="senha" type="password" autoComplete="new-password" minLength={8} required className={entrada} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">Repita a nova senha</span>
          <input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required className={entrada} />
        </label>
        {estado && (
          <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-accent" : "text-danger"}>
            {estado.mensagem}
          </p>
        )}
        <button type="submit" disabled={enviando} className="self-start rounded-full bg-accent px-5 py-2 font-medium text-white hover:brightness-110 disabled:opacity-50">
          {enviando ? "Trocando…" : "Trocar senha"}
        </button>
      </form>
    </section>
  );
}
