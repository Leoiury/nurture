"use client";

import { useActionState } from "react";
import { entrar } from "@/lib/auth/actions";

export function FormLogin() {
  const [estado, acao, enviando] = useActionState(entrar, undefined);

  return (
    <form action={acao} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={estado?.email}
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Senha
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2 font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
      </label>
      {estado?.erro && (
        <p role="alert" className="text-sm text-danger">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="mt-2 rounded-lg bg-accent px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
