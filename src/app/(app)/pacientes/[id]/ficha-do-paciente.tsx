"use client";

// Informações e plano do paciente, com edição num painel lateral.

import { useEffect, useState, type ReactNode } from "react";
import { formatarCpf, idade, nivelCadastral, type NivelCadastral } from "@/lib/pacientes";
import { atualizarPaciente, type DadosDoPaciente } from "../actions";

type Paciente = {
  id: string;
  nome: string;
  responsavel: string | null;
  data_nascimento: string | null;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  plano_id: string | null;
  ativo: boolean;
  nivel_cadastral: NivelCadastral;
  pendencias_cadastrais: string[];
  plano: { nome: string; cor: string } | null;
};

type Plano = { id: string; nome: string; ativo: boolean };

const dataBr = (d: string) => d.split("-").reverse().join("/");

export function FichaDoPaciente({ paciente: p, planos }: { paciente: Paciente; planos: Plano[] }) {
  const [editando, setEditando] = useState(false);
  const endereco = [p.endereco, p.bairro, [p.cidade, p.uf].filter(Boolean).join(" – "), p.cep].filter(Boolean).join(", ");

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.nome}
            {!p.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 align-middle text-xs font-normal text-muted">inativo</span>}
          </h1>
          {p.data_nascimento && (
            <p className="text-sm text-muted">
              {idade(p.data_nascimento)} · nascido(a) em {dataBr(p.data_nascimento)}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setEditando(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
          Editar
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <section className="rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5" aria-label="Informações do paciente">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Informações</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${nivelCadastral(p.nivel_cadastral).cor.selo}`}
              title={p.pendencias_cadastrais.length ? `Falta: ${p.pendencias_cadastrais.join(", ")}` : undefined}
            >
              Cadastro: {nivelCadastral(p.nivel_cadastral).rotulo.toLowerCase()}
            </span>
            {p.pendencias_cadastrais.length > 0 && <span className="text-xs text-muted">Falta: {p.pendencias_cadastrais.join(", ")}</span>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Item rotulo="Responsável">{p.responsavel}</Item>
            <Item rotulo="Celular">
              {p.celular && (
                <a href={`tel:${p.celular.replace(/\D/g, "")}`} className="text-accent hover:underline">
                  {p.celular}
                </a>
              )}
            </Item>
            <Item rotulo="E-mail">{p.email}</Item>
            <Item rotulo="CPF">{p.cpf && formatarCpf(p.cpf)}</Item>
            <Item rotulo="Endereço">{endereco || null}</Item>
          </dl>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5" aria-label="Plano do paciente">
          <h2 className="font-semibold">Plano</h2>
          {p.plano ? (
            <div
              className="relative overflow-hidden rounded-xl py-3 pr-3 pl-5 text-sm font-medium"
              style={{ background: `color-mix(in srgb, ${p.plano.cor} 26%, white)` }}
            >
              <span className="absolute inset-y-1.5 left-1.5 w-1 rounded-full" style={{ background: p.plano.cor }} aria-hidden />
              {p.plano.nome}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Sem plano padrão.{" "}
              <button type="button" onClick={() => setEditando(true)} className="text-accent hover:underline">
                Definir
              </button>
            </p>
          )}
          <p className="text-xs text-muted">Sugerido ao marcar atendimentos; cada atendimento pode ter outro plano.</p>
        </section>
      </div>

      {editando && <PainelDeEdicao paciente={p} planos={planos} aoFechar={() => setEditando(false)} />}
    </>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted">—</span>}</dd>
    </>
  );
}

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

function PainelDeEdicao({ paciente: p, planos, aoFechar }: { paciente: Paciente; planos: Plano[]; aoFechar: () => void }) {
  const [dados, setDados] = useState<DadosDoPaciente>({
    id: p.id,
    nome: p.nome,
    responsavel: p.responsavel ?? "",
    dataNascimento: p.data_nascimento ?? "",
    cpf: p.cpf ? formatarCpf(p.cpf) : "",
    celular: p.celular ?? "",
    email: p.email ?? "",
    endereco: p.endereco ?? "",
    bairro: p.bairro ?? "",
    cidade: p.cidade ?? "",
    uf: p.uf ?? "",
    cep: p.cep ?? "",
    planoId: p.plano_id,
    ativo: p.ativo,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = (chave: keyof DadosDoPaciente) => ({
    value: String(dados[chave] ?? ""),
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
    const r = await atualizarPaciente(dados).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={aoFechar} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label="Editar paciente" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Editar paciente</h2>
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
              <input {...campo("nome")} className={entrada} />
            </Campo>
            <Campo rotulo="Responsável" largo>
              <input {...campo("responsavel")} className={entrada} />
            </Campo>
            <Campo rotulo="Nascimento">
              <input type="date" {...campo("dataNascimento")} className={entrada} />
            </Campo>
            <Campo rotulo="CPF">
              <input {...campo("cpf")} inputMode="numeric" className={entrada} />
            </Campo>
            <Campo rotulo="Celular">
              <input {...campo("celular")} inputMode="tel" className={entrada} />
            </Campo>
            <Campo rotulo="E-mail">
              <input {...campo("email")} type="email" className={entrada} />
            </Campo>
            <Campo rotulo="Plano" largo>
              <select value={dados.planoId ?? ""} onChange={(e) => setDados({ ...dados, planoId: e.target.value || null })} className={entrada}>
                <option value="">Sem plano padrão</option>
                {planos
                  .filter((pl) => pl.ativo || pl.id === dados.planoId)
                  .map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.nome}
                      {!pl.ativo && " (inativo)"}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo rotulo="Endereço" largo>
              <input {...campo("endereco")} className={entrada} />
            </Campo>
            <Campo rotulo="Bairro">
              <input {...campo("bairro")} className={entrada} />
            </Campo>
            <Campo rotulo="Cidade">
              <input {...campo("cidade")} className={entrada} />
            </Campo>
            <Campo rotulo="UF">
              <input {...campo("uf")} maxLength={2} className={entrada} />
            </Campo>
            <Campo rotulo="CEP">
              <input {...campo("cep")} inputMode="numeric" className={entrada} />
            </Campo>
            <label className="col-span-2 flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={dados.ativo} onChange={(e) => setDados({ ...dados, ativo: e.target.checked })} className="size-4 accent-[var(--accent)]" />
              <span>
                Ativo
                <span className="block text-xs text-muted">Inativo: some da busca ao marcar atendimentos; o histórico continua.</span>
              </span>
            </label>
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
            <button type="submit" disabled={salvando} className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
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
