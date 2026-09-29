"use client";

// Lista de pacientes com busca (sem acentos: "joao" encontra "João"), filtro de
// ativos e cadastro rápido que leva direto à ficha. Na visão "Cadastro", cada
// paciente aparece na cor do nível do cadastro (completo, falta informação,
// crítico), com o que falta preencher e filtro por nível.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { NIVEIS_CADASTRAIS, idade, nivelCadastral, paraBusca, type NivelCadastral } from "@/lib/pacientes";
import { criarPaciente } from "../agenda/actions-novo-atendimento";

export type PacienteDaLista = {
  id: string;
  nome: string;
  responsavel: string | null;
  dataNascimento: string | null;
  celular: string | null;
  ativo: boolean;
  plano: { nome: string; cor: string } | null;
  nivel: NivelCadastral;
  /** O que falta no cadastro (ex.: "CPF", "endereço"). */
  pendencias: string[];
};

type Visao = "lista" | "cadastro";

const VISOES: [Visao, string, string][] = [
  ["lista", "Lista", "/pacientes"],
  ["cadastro", "Cadastro", "/pacientes?visao=cadastro"],
];

const entrada =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function ListaDePacientes({ pacientes, visao }: { pacientes: PacienteDaLista[]; visao: Visao }) {
  const [busca, setBusca] = useState("");
  const [inativos, setInativos] = useState(false);
  const [nivel, setNivel] = useState<NivelCadastral | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const cadastro = visao === "cadastro";

  // Busca e ativos valem nas duas visões; o nível, só na de cadastro.
  const encontrados = useMemo(() => {
    const termo = paraBusca(busca);
    return pacientes.filter(
      (p) =>
        (inativos || p.ativo) &&
        (!termo || paraBusca(p.nome).includes(termo) || (p.responsavel && paraBusca(p.responsavel).includes(termo))),
    );
  }, [pacientes, busca, inativos]);
  const visiveis = cadastro && nivel ? encontrados.filter((p) => p.nivel === nivel) : encontrados;
  const totalInativos = pacientes.filter((p) => !p.ativo).length;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
        <div className="flex items-center gap-2">
          <nav aria-label="Visualização" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
            {VISOES.map(([v, rotulo, href]) => (
              <Link
                key={v}
                href={href}
                aria-current={visao === v ? "page" : undefined}
                className={`rounded-full px-3 py-1 ${visao === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {rotulo}
              </Link>
            ))}
          </nav>
          <button type="button" onClick={() => setCadastrando(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
            Novo paciente
          </button>
        </div>
      </header>

      {cadastrando && <CadastroRapido nomeInicial={busca} aoCancelar={() => setCadastrando(false)} />}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do paciente ou responsável"
          aria-label="Buscar paciente"
          autoFocus
          className={`${entrada} max-w-md flex-1`}
        />
        {totalInativos > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Mostrar inativos ({totalInativos})
          </label>
        )}
        <span className="ml-auto text-sm text-muted">
          {visiveis.length} paciente{visiveis.length === 1 ? "" : "s"}
        </span>
      </div>

      {cadastro && (
        <div role="radiogroup" aria-label="Nível do cadastro" className="flex flex-wrap gap-1.5">
          {[null, ...NIVEIS_CADASTRAIS.map((n) => n.valor)].map((v) => {
            const n = v ? nivelCadastral(v) : null;
            const quantidade = v ? encontrados.filter((p) => p.nivel === v).length : encontrados.length;
            return (
              <button
                key={v ?? "todos"}
                type="button"
                role="radio"
                aria-checked={nivel === v}
                onClick={() => setNivel(v)}
                title={n?.descricao}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                  nivel === v ? "bg-surface font-medium shadow-sm ring-black/15" : "text-muted ring-black/5 hover:text-foreground"
                }`}
              >
                {n && <span className={`size-2.5 rounded-full ${n.cor.marca}`} aria-hidden />}
                {n ? n.rotulo : "Todos"}
                <span className="text-xs text-muted tabular-nums">{quantidade}</span>
              </button>
            );
          })}
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhum paciente encontrado.</p>
      ) : cadastro ? (
        <ul className="flex flex-col gap-1.5" aria-label="Pacientes por nível do cadastro">
          {visiveis.map((p) => {
            const n = nivelCadastral(p.nivel);
            return (
              <li key={p.id} data-nivel={p.nivel}>
                <Link
                  href={`/pacientes/${p.id}`}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-xl py-2.5 pr-4 pl-5 text-sm ring-1 ring-black/5 transition hover:brightness-[0.98] ${n.cor.fundo}`}
                >
                  <span className={`absolute inset-y-0 left-0 w-1.5 ${n.cor.marca}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${p.ativo ? "" : "text-muted"}`}>
                      {p.nome}
                      {!p.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal">inativo</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {p.pendencias.length ? `Falta: ${p.pendencias.join(", ")}` : "Cadastro completo"}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${n.cor.selo}`}>{n.rotulo}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          {visiveis.map((p) => (
            <li key={p.id}>
              <Link href={`/pacientes/${p.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-background">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.plano?.cor ?? "transparent" }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${p.ativo ? "" : "text-muted"}`}>
                    {p.nome}
                    {!p.ativo && <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal">inativo</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[p.dataNascimento && idade(p.dataNascimento), p.responsavel && `Resp.: ${p.responsavel}`, p.celular].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs text-muted sm:block">{p.plano?.nome ?? "Sem plano"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CadastroRapido({ nomeInicial, aoCancelar }: { nomeInicial: string; aoCancelar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await criarPaciente({ nome, responsavel: "", celular: "", planoId: null }).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) {
      setSalvando(false);
      return setErro(r.erro);
    }
    // O restante (responsável, contato, plano…) se completa na ficha.
    router.push(`/pacientes/${r.paciente.id}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-black/5"
    >
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" aria-label="Nome do novo paciente" autoFocus className={`${entrada} max-w-md flex-1`} />
      <button type="submit" disabled={salvando} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
        {salvando ? "Cadastrando…" : "Cadastrar e abrir ficha"}
      </button>
      <button type="button" onClick={aoCancelar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
        Cancelar
      </button>
      {erro && (
        <p role="alert" className="w-full text-sm text-danger">
          {erro}
        </p>
      )}
    </form>
  );
}
