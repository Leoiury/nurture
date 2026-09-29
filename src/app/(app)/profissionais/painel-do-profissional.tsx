"use client";

// Criar ou editar um profissional (painel lateral).

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { salvarProfissional, type DadosDoProfissional } from "./actions";

export type ProfissionalEditavel = {
  id: string;
  nome: string;
  especialidade: string | null;
  registro: string | null;
  celular: string | null;
  email: string | null;
  ativo: boolean;
};

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

type Props = {
  profissional: ProfissionalEditavel | null;
  /** Atendimentos marcados daqui para a frente (aviso ao desativar). */
  futuros?: number;
  aoFechar: () => void;
};

export function PainelDoProfissional({ profissional: p, futuros = 0, aoFechar }: Props) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosDoProfissional>({
    id: p?.id,
    nome: p?.nome ?? "",
    especialidade: p?.especialidade ?? "",
    registro: p?.registro ?? "",
    celular: p?.celular ?? "",
    email: p?.email ?? "",
    ativo: p?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = (chave: "nome" | "especialidade" | "registro" | "celular" | "email") => ({
    value: dados[chave],
    onChange: (e: { target: { value: string } }) => setDados({ ...dados, [chave]: e.target.value }),
  });

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await salvarProfissional(dados).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
    if (!p) router.push(`/profissionais/${r.id}`);
  }

  const titulo = p ? "Editar profissional" : "Novo profissional";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full px-2 py-1 text-muted hover:bg-background" aria-label="Fechar">
            ✕
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto px-5 py-4 text-sm">
            <Campo rotulo="Nome" largo>
              <input {...campo("nome")} autoFocus className={entrada} />
            </Campo>
            <Campo rotulo="Especialidade" largo>
              <input {...campo("especialidade")} placeholder="Ex.: Psicóloga" className={entrada} />
            </Campo>
            <Campo rotulo="Registro no conselho" largo>
              <input {...campo("registro")} placeholder="Ex.: CRP 12/12345" className={entrada} />
            </Campo>
            <Campo rotulo="Celular">
              <input {...campo("celular")} inputMode="tel" className={entrada} />
            </Campo>
            <Campo rotulo="E-mail">
              <input {...campo("email")} type="email" className={entrada} />
            </Campo>
            {p && (
              <label className="col-span-2 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={dados.ativo}
                  onChange={(e) => setDados({ ...dados, ativo: e.target.checked })}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  Ativo
                  <span className="block text-xs text-muted">Inativo: sai da agenda e do formulário de atendimento; o histórico continua.</span>
                  {!dados.ativo && p.ativo && futuros > 0 && (
                    <span role="alert" className="mt-1 block text-xs text-danger">
                      Há {futuros} atendimento{futuros === 1 ? "" : "s"} marcado{futuros === 1 ? "" : "s"} daqui para a frente: eles deixam de aparecer na agenda.
                      Remaneje antes de desativar.
                    </span>
                  )}
                </span>
              </label>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
            {erro && (
              <p role="alert" className="mr-auto text-sm text-danger">
                {erro}
              </p>
            )}
            <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !dados.nome.trim()}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function Campo({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${largo ? "col-span-2" : ""}`}>
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">{rotulo}</span>
      {children}
    </label>
  );
}
