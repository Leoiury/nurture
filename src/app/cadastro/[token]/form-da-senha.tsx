"use client";

// Redefinir a senha: primeiro a pessoa confirma quem é, depois escolhe a senha nova.

import { useActionState, useState } from "react";
import { redefinirSenha } from "./actions";

const entrada = "rounded-lg border border-border bg-surface px-3 py-2 font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function FormDaSenha({ token, profissional, login }: { token: string; profissional: string; login: string }) {
  const [confirmou, setConfirmou] = useState(false);
  const [estado, acao, enviando] = useActionState(redefinirSenha.bind(null, token), undefined);

  if (!confirmou) {
    return (
      <div className="mt-4 flex flex-col gap-4 text-sm">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Passo 1 de 2</p>
        <p>
          Este link redefine a senha de <strong className="font-semibold">{profissional}</strong>.
        </p>
        <button type="button" onClick={() => setConfirmou(true)} className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition hover:opacity-90">
          Sou eu, continuar
        </button>
        <p className="text-xs text-muted">Não é você? Não continue e avise a clínica.</p>
      </div>
    );
  }

  return (
    <form action={acao} className="mt-4 flex flex-col gap-4 text-sm">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Passo 2 de 2</p>
      <p className="text-muted">
        Você entra com <strong className="font-medium text-foreground">{login}</strong> e a senha nova.
      </p>
      <input type="text" name="login" autoComplete="username" value={login} readOnly hidden />
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 font-medium">
          Senha nova
          <input name="senha" type="password" autoComplete="new-password" minLength={8} required autoFocus aria-describedby="regra-da-senha" className={entrada} />
        </label>
        <p id="regra-da-senha" className="text-xs text-muted">Ao menos 8 caracteres.</p>
      </div>
      <label className="flex flex-col gap-1.5 font-medium">
        Repita a senha
        <input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required className={entrada} />
      </label>
      {estado?.erro && (
        <p role="alert" className="text-danger">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={enviando} className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-60">
        {enviando ? "Salvando…" : "Salvar a senha nova"}
      </button>
    </form>
  );
}
