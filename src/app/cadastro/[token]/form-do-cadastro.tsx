"use client";

// Cadastro guiado: primeiro a pessoa confirma quem é, depois escolhe o nome de usuário e a senha.

import { useActionState, useState } from "react";
import { concluirCadastro } from "./actions";

const entrada = "rounded-lg border border-border bg-surface px-3 py-2 font-normal outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function FormDoCadastro({ token, profissional }: { token: string; profissional: string }) {
  const [confirmou, setConfirmou] = useState(false);
  const [estado, acao, enviando] = useActionState(concluirCadastro.bind(null, token), undefined);

  if (!confirmou) {
    return (
      <div className="mt-4 flex flex-col gap-4 text-sm">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Passo 1 de 2</p>
        <p>
          Este link cria o acesso de <strong className="font-semibold">{profissional}</strong> à agenda da clínica.
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
      <p className="text-muted">Com este nome de usuário e esta senha, você vai entrar na Nurture.</p>
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 font-medium">
          Nome de usuário
          <input name="usuario" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={estado?.usuario} required minLength={3} maxLength={30} autoFocus aria-describedby="regra-do-usuario" className={entrada} />
        </label>
        <p id="regra-do-usuario" className="text-xs text-muted">Letras sem acento, números, ponto, hífen ou sublinhado. Ex.: ana.costa</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 font-medium">
          Senha
          <input name="senha" type="password" autoComplete="new-password" minLength={8} required aria-describedby="regra-da-senha" className={entrada} />
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
        {enviando ? "Criando…" : "Criar meu acesso"}
      </button>
    </form>
  );
}
