"use client";

// Inativar ou reativar o profissional, com aviso dos atendimentos que precisam de revisão.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FUSO } from "@/lib/agenda/tempo";
import { atendimentosParaRevisar, inativarProfissional, reativarProfissional, type AtendimentoParaRevisar } from "../actions";

const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const secundario = "rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07] disabled:opacity-50";

type Revisao = { total: number; lista: AtendimentoParaRevisar[] };

export function BotaoDeInativar({ profissional: p }: { profissional: { id: string; nome: string; ativo: boolean } }) {
  const router = useRouter();
  const [revisao, setRevisao] = useState<Revisao | null>(null);
  const [reativando, setReativando] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregar() {
    setTrabalhando(true);
    setErro(null);
    setAviso(null);
    const r = await atendimentosParaRevisar(p.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    setRevisao({ total: r.total, lista: r.lista });
  }

  async function inativar() {
    if (!revisao) return;
    setTrabalhando(true);
    setErro(null);
    const r = await inativarProfissional(p.id, revisao.total).catch(() => ({ ok: false as const, erro: "Falha de conexão.", mudou: false }));
    setTrabalhando(false);
    if (!r.ok) {
      setErro(r.erro);
      if (r.mudou) void carregar();
      return;
    }
    setRevisao(null);
    const partes = ["Profissional inativado."];
    if (r.loginsBloqueados > 0) partes.push("O login foi bloqueado.");
    if (r.loginsMantidos > 0) partes.push("O login de administrador vinculado continua ativo.");
    setAviso(partes.join(" "));
    router.refresh();
  }

  async function reativar() {
    setTrabalhando(true);
    setErro(null);
    const r = await reativarProfissional(p.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    setReativando(false);
    setAviso("Profissional reativado. Se havia login, ele continua bloqueado: libere em Configurações → Usuários.");
    router.refresh();
  }

  const fechar = () => {
    setRevisao(null);
    setReativando(false);
    setErro(null);
  };

  return (
    <>
      {p.ativo ? (
        <button type="button" disabled={trabalhando} onClick={() => void carregar()} className={secundario}>
          Inativar
        </button>
      ) : (
        <button type="button" disabled={trabalhando} onClick={() => setReativando(true)} className={secundario}>
          Reativar
        </button>
      )}
      {erro && !revisao && !reativando && (
        <p role="alert" className="w-full text-sm text-danger">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="w-full text-sm text-muted">
          {aviso}
        </p>
      )}

      {(revisao || reativando) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={fechar} aria-hidden />
          <div role="alertdialog" aria-modal="true" aria-label={revisao ? "Inativar profissional" : "Reativar profissional"} className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto rounded-3xl bg-surface p-5 text-sm shadow-2xl">
            {revisao ? (
              <>
                <p className="text-base font-semibold">Inativar {p.nome}?</p>
                {revisao.total > 0 ? (
                  <>
                    <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
                      {revisao.total === 1 ? "Há 1 atendimento marcado que precisa" : `Há ${revisao.total} atendimentos marcados que precisam`} de revisão. Se continuar sem remanejar, {revisao.total === 1 ? "ele continua marcado, mas deixa" : "eles continuam marcados, mas deixam"} de aparecer na agenda.
                    </p>
                    <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                      {revisao.lista.map((a) => (
                        <li key={a.id}>
                          <Link href={`/agenda?dia=${a.data}`} className="flex justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-background">
                            <span className="truncate font-medium">{a.paciente}</span>
                            <span className="shrink-0 text-muted tabular-nums">{quando.format(new Date(a.inicio))}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {revisao.total > revisao.lista.length && <p className="text-xs text-muted">Mostrando os {revisao.lista.length} primeiros.</p>}
                  </>
                ) : (
                  <p>Não há atendimentos marcados daqui para a frente.</p>
                )}
                <p className="text-muted">O profissional sai da agenda e do formulário de atendimento, e o histórico continua. O login de profissional é bloqueado, e os links de acesso pendentes são cancelados.</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">Reativar {p.nome}?</p>
                <p className="text-muted">O profissional volta à agenda. Se havia login, ele continua bloqueado até um ADM liberar em Configurações → Usuários.</p>
              </>
            )}
            {erro && (
              <p role="alert" className="text-danger">
                {erro}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={fechar} className={secundario}>
                {revisao && revisao.total > 0 ? "Revisar antes" : "Cancelar"}
              </button>
              {revisao ? (
                <button type="button" disabled={trabalhando} onClick={() => void inativar()} className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
                  {revisao.total > 0 ? "Inativar mesmo assim" : "Inativar"}
                </button>
              ) : (
                <button type="button" disabled={trabalhando} onClick={() => void reativar()} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
                  Reativar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
