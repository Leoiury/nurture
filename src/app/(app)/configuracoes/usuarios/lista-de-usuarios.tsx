"use client";

import { useEffect, useState, type ReactNode } from "react";
import { atualizarUsuario, criarUsuario, gerarNovaSenha } from "./actions";

type Perfil = "adm" | "limitado";

export type UsuarioDaLista = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  profissionalId: string | null;
  ultimoAcesso: string | null;
};

type Profissional = { id: string; nome: string };

const ROTULO_PERFIL: Record<Perfil, string> = { adm: "Administrador", limitado: "Limitado" };
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ListaDeUsuarios({ usuarios, profissionais, euId }: { usuarios: UsuarioDaLista[]; profissionais: Profissional[]; euId: string }) {
  const [editando, setEditando] = useState<UsuarioDaLista | "novo" | null>(null);
  const [senha, setSenha] = useState<{ email: string; senha: string } | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditando("novo")} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
          + Novo usuário
        </button>
      </div>

      {senha && <SenhaProvisoria {...senha} aoFechar={() => setSenha(null)} />}

      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5" aria-label="Usuários">
        {usuarios.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => setEditando(u)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-background ${u.ativo ? "" : "opacity-60"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {u.nome}
                  {u.id === euId && <span className="ml-2 text-xs font-normal text-muted">(você)</span>}
                  {!u.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-px text-[11px] font-normal text-muted">inativo</span>}
                </span>
                <span className="block truncate text-muted">{u.email}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted">
                <span className={`rounded-full px-2 py-0.5 font-medium ${u.perfil === "adm" ? "bg-accent-soft text-accent" : "bg-black/5"}`}>{ROTULO_PERFIL[u.perfil]}</span>
                <span className="mt-1 hidden sm:block">{u.ultimoAcesso ? `Último acesso ${dataHora.format(new Date(u.ultimoAcesso))}` : "Nunca entrou"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {editando && (
        <PainelDoUsuario
          key={editando === "novo" ? "novo" : editando.id}
          usuario={editando === "novo" ? null : editando}
          profissionais={profissionais}
          aoFechar={() => setEditando(null)}
          aoGerarSenha={(email, s) => setSenha({ email, senha: s })}
        />
      )}
    </>
  );
}

/** A senha provisória aparece uma única vez, para ser passada à pessoa. */
function SenhaProvisoria({ email, senha, aoFechar }: { email: string; senha: string; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div role="status" aria-label="Senha provisória" className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200">
      <p>
        Senha provisória de <strong>{email}</strong> (aparece só agora; peça para a pessoa trocá-la em <em>Minha conta</em> ao entrar):
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code data-senha className="rounded-lg bg-white px-3 py-1.5 font-mono text-base tracking-wider ring-1 ring-amber-200">
          {senha}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(senha).then(() => setCopiado(true));
          }}
          className="rounded-full bg-black/[0.04] px-3 py-1.5 hover:bg-black/[0.07]"
        >
          {copiado ? "Copiada" : "Copiar"}
        </button>
        <button type="button" onClick={aoFechar} className="ml-auto text-xs text-muted hover:underline">
          Já anotei
        </button>
      </div>
    </div>
  );
}

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

type PainelProps = {
  usuario: UsuarioDaLista | null;
  profissionais: Profissional[];
  aoFechar: () => void;
  aoGerarSenha: (email: string, senha: string) => void;
};

function PainelDoUsuario({ usuario: u, profissionais, aoFechar, aoGerarSenha }: PainelProps) {
  const [nome, setNome] = useState(u?.nome ?? "");
  const [email, setEmail] = useState(u?.email ?? "");
  const [perfil, setPerfil] = useState<Perfil>(u?.perfil ?? "limitado");
  const [profissionalId, setProfissionalId] = useState(u?.profissionalId ?? "");
  const [ativo, setAtivo] = useState(u?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
    const falha = { ok: false as const, erro: "Falha de conexão." };
    if (!u) {
      const r = await criarUsuario({ nome, email, perfil, profissionalId: profissionalId || null }).catch(() => falha);
      setSalvando(false);
      if (!r.ok) return setErro(r.erro);
      aoGerarSenha(r.email, r.senha);
      return aoFechar();
    }
    const r = await atualizarUsuario({ id: u.id, nome, perfil, profissionalId: profissionalId || null, ativo }).catch(() => falha);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  async function novaSenha() {
    if (!u || !confirm(`Gerar uma nova senha provisória para ${u.nome}? A senha atual deixa de funcionar.`)) return;
    const r = await gerarNovaSenha(u.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) return setErro(r.erro);
    aoGerarSenha(u.email, r.senha);
    aoFechar();
  }

  const titulo = u ? "Editar usuário" : "Novo usuário";
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
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm">
            <Campo rotulo="Nome">
              <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus className={entrada} />
            </Campo>
            <Campo rotulo="E-mail (login)">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!u} className={`${entrada} disabled:bg-background disabled:text-muted`} />
            </Campo>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Perfil</legend>
              {(["limitado", "adm"] as Perfil[]).map((p) => (
                <label key={p} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-background">
                  <input type="radio" name="perfil" checked={perfil === p} onChange={() => setPerfil(p)} className="mt-0.5 accent-[var(--accent)]" />
                  <span>
                    {ROTULO_PERFIL[p]}
                    <span className="block text-xs text-muted">
                      {p === "adm" ? "Tudo, inclusive configurações, planejamento, importação e usuários." : "Agenda e pacientes; vê profissionais, sem alterar cadastros."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Campo rotulo="Profissional vinculado (opcional)">
              <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)} className={entrada}>
                <option value="">Nenhum</option>
                {profissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            {u && (
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>
                  Ativo
                  <span className="block text-xs text-muted">Inativo: o login fica bloqueado; o histórico continua.</span>
                </span>
              </label>
            )}
            {u && (
              <div className="mt-2 border-t border-border pt-4">
                <button type="button" onClick={() => void novaSenha()} className="text-xs text-accent underline-offset-2 hover:underline">
                  Gerar nova senha provisória
                </button>
              </div>
            )}
            {!u && <p className="text-xs text-muted">Ao salvar, o sistema gera uma senha provisória para você passar à pessoa.</p>}
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
              disabled={salvando || !nome.trim() || !email.trim()}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {salvando ? "Salvando…" : u ? "Salvar" : "Criar usuário"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">{rotulo}</span>
      {children}
    </label>
  );
}
