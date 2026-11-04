"use client";

// Links para os profissionais sem login criarem o próprio acesso, já vinculado. O link
// só aparece ao ser gerado: o banco guarda apenas o hash.

import { useState } from "react";
import { mensagemDoLink } from "@/lib/auth/mensagem-do-link";
import { cancelarConvite, gerarConvite } from "./actions";

export type ProfissionalSemLogin = { id: string; nome: string; convite: { id: string; expiraEm: string } | null };

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export function Convites({ profissionais }: { profissionais: ProfissionalSemLogin[] }) {
  const [gerado, setGerado] = useState<{ id: string; mensagem: string; link: string; trocou: boolean } | null>(null);
  const [trabalhando, setTrabalhando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  if (profissionais.length === 0) return null;

  async function gerar(p: ProfissionalSemLogin) {
    setTrabalhando(p.id);
    setErro(null);
    const r = await gerarConvite(p.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(null);
    if (!r.ok) return setErro(r.erro);
    const link = `${window.location.origin}/cadastro/${r.token}`;
    setCopiado(null);
    setGerado({ id: p.id, link, mensagem: mensagemDoLink(r.tipo, p.nome, link, r.expiraEm), trocou: !!p.convite });
  }

  async function cancelar(p: ProfissionalSemLogin) {
    if (!p.convite) return;
    setTrabalhando(p.id);
    setErro(null);
    const r = await cancelarConvite(p.convite.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(null);
    if (!r.ok) return setErro(r.erro);
    if (gerado?.id === p.id) setGerado(null);
  }

  function copiar(texto: string, qual: string) {
    void navigator.clipboard?.writeText(texto).then(() => setCopiado(qual));
  }

  return (
    <section aria-label="Convites para profissionais" className="flex flex-col gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5">
      <div>
        <h2 className="font-semibold">Profissionais sem login</h2>
        <p className="text-muted">Gere um link para cada um criar o próprio acesso, já vinculado ao cadastro dele.</p>
      </div>
      {erro && <p role="alert" className="text-danger">{erro}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {profissionais.map((p) => (
          <li key={p.id} aria-label={p.nome} className="flex flex-col gap-2 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.nome}</span>
                <span className="block text-xs text-muted">{p.convite ? `Link em aberto até ${data.format(new Date(p.convite.expiraEm))}` : "Sem link"}</span>
              </span>
              {p.convite && (
                <button type="button" disabled={trabalhando === p.id} onClick={() => void cancelar(p)} className="rounded-full px-3 py-1.5 text-muted hover:bg-background disabled:opacity-50">
                  Cancelar link
                </button>
              )}
              <button type="button" disabled={trabalhando === p.id} onClick={() => void gerar(p)} className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium hover:bg-black/[0.07] disabled:opacity-50">
                {p.convite ? "Gerar outro link" : "Gerar link"}
              </button>
            </div>
            {gerado?.id === p.id && (
              <div role="status" aria-label={`Mensagem para ${p.nome}`} className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-xs text-amber-900">O link aparece só agora. Envie a mensagem diretamente à pessoa.{gerado.trocou ? " O link anterior deixou de valer." : ""}</p>
                <textarea readOnly value={gerado.mensagem} rows={6} aria-label="Mensagem" className="w-full resize-none rounded-lg bg-white p-2 text-xs ring-1 ring-amber-200 outline-none" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copiar(gerado.mensagem, "mensagem")} className="rounded-full bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110">
                    {copiado === "mensagem" ? "Mensagem copiada" : "Copiar mensagem"}
                  </button>
                  <button type="button" onClick={() => copiar(gerado.link, "link")} className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium hover:bg-black/[0.07]">
                    {copiado === "link" ? "Link copiado" : "Copiar só o link"}
                  </button>
                  <button type="button" onClick={() => setGerado(null)} className="ml-auto text-xs text-muted hover:underline">
                    Já enviei
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
