"use client";

// O acesso do profissional (só ADM): gerar o login, ou redefinir a senha de quem já tem.
// O link só aparece ao ser gerado: o banco guarda apenas o hash.

import { useState } from "react";
import { linkDoWhatsApp, mensagemDoLink, type TipoDeLink } from "@/lib/auth/mensagem-do-link";
import { cancelarConvite, gerarConvite } from "../../configuracoes/usuarios/actions";
import { DESCRICAO_PERFIL, ROTULO_PERFIL } from "../../configuracoes/usuarios/lista-de-usuarios";

type Perfil = keyof typeof ROTULO_PERFIL;

type Props = {
  profissional: { id: string; nome: string; celular: string | null; email: string | null; ativo: boolean };
  login: { identificacao: string; perfil: Perfil } | null;
  link: { id: string; tipo: TipoDeLink; expiraEm: string } | null;
};

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const OQUE_FAZ: Record<TipoDeLink, string> = { login: "criar o login", senha: "redefinir a senha" };
const claro = "rounded-full bg-black/[0.04] px-3 py-1.5 font-medium hover:bg-black/[0.07] disabled:opacity-50";

export function AcessoDoProfissional({ profissional: p, login, link }: Props) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [perfil, setPerfil] = useState<Perfil>("profissional");
  const [gerado, setGerado] = useState<{ link: string; mensagem: string; trocou: boolean } | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function gerar() {
    setTrabalhando(true);
    setErro(null);
    const r = await gerarConvite(p.id, perfil).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    const endereco = `${window.location.origin}/cadastro/${r.token}`;
    setCopiado(null);
    setEscolhendo(false);
    setGerado({ link: endereco, mensagem: mensagemDoLink(r.tipo, p.nome, endereco, r.expiraEm), trocou: !!link });
  }

  async function cancelar() {
    if (!link) return;
    setTrabalhando(true);
    setErro(null);
    const r = await cancelarConvite(link.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!r.ok) return setErro(r.erro);
    setGerado(null);
  }

  function copiar(texto: string, qual: string) {
    void navigator.clipboard?.writeText(texto).then(() => setCopiado(qual));
  }

  const whatsapp = gerado && linkDoWhatsApp(p.celular, gerado.mensagem);

  return (
    <section aria-label="Acesso" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 text-sm shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Acesso</h2>
          <p className="text-muted">
            {login ? (
              <>
                Login <strong className="font-medium text-foreground">{login.identificacao}</strong> · {ROTULO_PERFIL[login.perfil]}
              </>
            ) : (
              "Sem login"
            )}
            {link && ` · link para ${OQUE_FAZ[link.tipo]} em aberto até ${data.format(new Date(link.expiraEm))}`}
          </p>
        </div>
        {p.ativo ? (
          <div className="flex flex-wrap gap-2">
            {link && (
              <button type="button" disabled={trabalhando} onClick={() => void cancelar()} className="rounded-full px-3 py-1.5 text-muted hover:bg-background disabled:opacity-50">
                Cancelar link
              </button>
            )}
            {login ? (
              <button type="button" disabled={trabalhando} onClick={() => void gerar()} className={claro}>
                Redefinir senha
              </button>
            ) : (
              <button type="button" disabled={trabalhando} onClick={() => setEscolhendo(true)} className={claro}>
                Gerar login
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">Profissional inativo: ative o cadastro para gerar o acesso.</p>
        )}
      </div>

      {erro && <p role="alert" className="text-danger">{erro}</p>}

      {escolhendo && !login && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void gerar();
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Tipo de login</legend>
            {(["profissional", "limitado", "adm"] as Perfil[]).map((t) => (
              <label key={t} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-background">
                <input type="radio" name="tipo-de-login" checked={perfil === t} onChange={() => setPerfil(t)} className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  {ROTULO_PERFIL[t]}
                  <span className="block text-xs text-muted">{DESCRICAO_PERFIL[t]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {perfil === "adm" && <p className="text-xs text-danger">Quem usar este link entra como administrador, com acesso a tudo.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEscolhendo(false)} className="rounded-full px-3 py-1.5 text-muted hover:bg-background">
              Cancelar
            </button>
            <button type="submit" disabled={trabalhando} className="rounded-full bg-accent px-4 py-1.5 font-medium text-white hover:brightness-110 disabled:opacity-50">
              Salvar
            </button>
          </div>
        </form>
      )}

      {gerado && (
        <div role="status" aria-label={`Mensagem para ${p.nome}`} className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-xs text-amber-900">O link aparece só agora. Envie a mensagem diretamente à pessoa.{gerado.trocou ? " O link anterior deixou de valer." : ""}</p>
          <textarea readOnly value={gerado.mensagem} rows={6} aria-label="Mensagem" className="w-full resize-none rounded-lg bg-white p-2 text-xs ring-1 ring-amber-200 outline-none" />
          <div className="flex flex-wrap items-center gap-2">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-full bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110">
                Enviar pelo WhatsApp
              </a>
            )}
            {p.email && (
              <a href={`mailto:${p.email}?subject=${encodeURIComponent("Seu acesso à Nurture")}&body=${encodeURIComponent(gerado.mensagem)}`} className={claro}>
                Enviar por e-mail
              </a>
            )}
            <button type="button" onClick={() => copiar(gerado.mensagem, "mensagem")} className={claro}>
              {copiado === "mensagem" ? "Mensagem copiada" : "Copiar mensagem"}
            </button>
            <button type="button" onClick={() => copiar(gerado.link, "link")} className={claro}>
              {copiado === "link" ? "Link copiado" : "Copiar só o link"}
            </button>
            <button type="button" onClick={() => setGerado(null)} className="ml-auto text-xs text-muted hover:underline">
              Já enviei
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
