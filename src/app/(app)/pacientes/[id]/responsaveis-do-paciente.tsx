"use client";

// Responsáveis do paciente: uma pessoa pode responder por vários pacientes, e o paciente pode ter vários.

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatarCpf } from "@/lib/pacientes";
import { buscarResponsaveis, desvincularResponsavel, salvarResponsavel, vincularResponsavel, type ResponsavelEncontrado } from "../actions-responsaveis";

export type ResponsavelDaFicha = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  whatsapp: string | null;
  /** Os outros pacientes por quem a pessoa responde. */
  outrosPacientes: { id: string; nome: string }[];
};

const entrada = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
const secundario = "rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-medium hover:bg-black/[0.07] disabled:opacity-50";
const primario = "rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50";

/** Link do WhatsApp: número com o código do Brasil, se faltar. */
function linkDoWhatsapp(numero: string) {
  const digitos = numero.replace(/\D/g, "");
  return `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`;
}

export function ResponsaveisDoPaciente({ pacienteId, responsaveis }: { pacienteId: string; responsaveis: ResponsavelDaFicha[] }) {
  const [adicionando, setAdicionando] = useState(false);
  return (
    <section aria-label="Responsáveis" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Responsáveis</h2>
        {!adicionando && (
          <button type="button" onClick={() => setAdicionando(true)} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
            Adicionar responsável
          </button>
        )}
      </div>
      {responsaveis.length === 0 && !adicionando && <p className="text-sm text-muted">Nenhum responsável.</p>}
      {responsaveis.length > 0 && (
        <ul className="flex flex-col gap-2">
          {responsaveis.map((r) => (
            <CartaoDoResponsavel key={r.id} pacienteId={pacienteId} responsavel={r} />
          ))}
        </ul>
      )}
      {adicionando && <AdicionarResponsavel pacienteId={pacienteId} aoFechar={() => setAdicionando(false)} />}
    </section>
  );
}

function CartaoDoResponsavel({ pacienteId, responsavel: r }: { pacienteId: string; responsavel: ResponsavelDaFicha }) {
  const [editando, setEditando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    setTrabalhando(true);
    const resultado = await desvincularResponsavel(pacienteId, r.id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(false);
    if (!resultado.ok) setErro(resultado.erro);
  }

  if (editando) {
    return (
      <li className="rounded-2xl bg-black/[0.03] p-4">
        <FormDoResponsavel pacienteId={pacienteId} responsavel={r} aoFechar={() => setEditando(false)} />
      </li>
    );
  }
  return (
    <li aria-label={r.nome} className="flex flex-col gap-2 rounded-2xl bg-black/[0.03] p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{r.nome}</p>
        <div className="flex gap-1">
          <button type="button" aria-label={`Editar responsável ${r.nome}`} onClick={() => setEditando(true)} className={secundario}>
            Editar
          </button>
          {!removendo && (
            <button type="button" aria-label={`Remover responsável ${r.nome}`} onClick={() => setRemovendo(true)} className={secundario}>
              Remover
            </button>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">CPF</dt>
        <dd>{r.cpf ? formatarCpf(r.cpf) : <span className="text-muted">—</span>}</dd>
        <dt className="text-muted">E-mail</dt>
        <dd className="min-w-0 break-words">{r.email || <span className="text-muted">—</span>}</dd>
        <dt className="text-muted">WhatsApp</dt>
        <dd>
          {r.whatsapp ? (
            <a href={linkDoWhatsapp(r.whatsapp)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {r.whatsapp}
            </a>
          ) : (
            <span className="text-muted">—</span>
          )}
        </dd>
        {r.outrosPacientes.length > 0 && (
          <>
            <dt className="text-muted">Também por</dt>
            <dd className="flex flex-wrap gap-x-2">
              {r.outrosPacientes.map((p) => (
                <Link key={p.id} href={`/pacientes/${p.id}`} className="text-accent hover:underline">
                  {p.nome}
                </Link>
              ))}
            </dd>
          </>
        )}
      </dl>
      {removendo && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">
          <span>{r.outrosPacientes.length > 0 ? "Tirar esta pessoa dos responsáveis deste paciente?" : "Esta pessoa não responde por mais ninguém: os dados dela serão apagados."}</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => setRemovendo(false)} className={secundario}>
              Cancelar
            </button>
            <button type="button" disabled={trabalhando} onClick={() => void remover()} className="rounded-full bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Confirmar remoção
            </button>
          </span>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}

function AdicionarResponsavel({ pacienteId, aoFechar }: { pacienteId: string; aoFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<ResponsavelEncontrado[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    const espera = setTimeout(() => {
      buscarResponsaveis(busca, pacienteId)
        .then((r) => vigente && setEncontrados(r))
        .catch(() => vigente && setEncontrados([]));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [busca, pacienteId]);

  async function vincular(id: string) {
    const r = await vincularResponsavel(pacienteId, id).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    if (!r.ok) return setErro(r.erro);
    aoFechar();
  }

  return (
    <div role="group" aria-label="Adicionar responsável" className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4 text-sm">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Já cadastrado em outro paciente?</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF" aria-label="Buscar responsável" className={entrada} />
      </label>
      {encontrados.length > 0 && (
        <ul className="flex flex-col gap-1">
          {encontrados.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => void vincular(r.id)} className="flex w-full justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-left hover:ring-1 hover:ring-accent">
                <span className="font-medium">{r.nome}</span>
                <span className="text-muted tabular-nums">{r.cpf ? formatarCpf(r.cpf) : "Sem CPF"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-danger">
          {erro}
        </p>
      )}
      <p className="font-medium">Ou cadastre um novo</p>
      <FormDoResponsavel pacienteId={pacienteId} aoFechar={aoFechar} />
    </div>
  );
}

function FormDoResponsavel({ pacienteId, responsavel: r, aoFechar }: { pacienteId: string; responsavel?: ResponsavelDaFicha; aoFechar: () => void }) {
  const [nome, setNome] = useState(r?.nome ?? "");
  const [cpf, setCpf] = useState(r?.cpf ? formatarCpf(r.cpf) : "");
  const [email, setEmail] = useState(r?.email ?? "");
  const [whatsapp, setWhatsapp] = useState(r?.whatsapp ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const resultado = await salvarResponsavel({ id: r?.id, pacienteId, nome, cpf, email, whatsapp }).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!resultado.ok) return setErro(resultado.erro);
    aoFechar();
  }

  return (
    <form
      className="grid gap-3 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="font-medium">Nome completo</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={entrada} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">CPF</span>
        <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" className={entrada} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">WhatsApp</span>
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="(49) 90000-0000" className={entrada} />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="font-medium">E-mail</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={entrada} />
      </label>
      {erro && (
        <p role="alert" className="text-danger sm:col-span-2">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Cancelar
        </button>
        <button type="submit" disabled={salvando || nome.trim().length < 3} className={primario}>
          {salvando ? "Salvando…" : "Salvar responsável"}
        </button>
      </div>
    </form>
  );
}
