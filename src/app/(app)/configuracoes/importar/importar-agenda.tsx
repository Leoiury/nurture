"use client";

// Tela de importação: enviar o arquivo, resolver o que o app não reconheceu,
// conferir o resumo por mês (simulado, nada gravado) e importar os meses marcados.

import Link from "next/link";
import { useState } from "react";
import { nomeDoMes } from "@/lib/agenda/tempo";
import { analisarImportacao, importarAgenda, type Acao, type Analise, type Escolhas } from "./actions";

const COLUNAS: [Acao, string, string][] = [
  ["novos", "Novos", "Entram na agenda"],
  ["atualizados", "Atualizados", "Mudaram no sistema anterior"],
  ["iguais", "Iguais", "Já estão iguais no app"],
  ["mantidos", "Mantidos", "Modificados no app: vale a versão do app"],
  ["excluidos", "Excluídos", "Apagados no sistema anterior"],
];

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const valorDoConvenio = (v: number | null) => (v === null ? "sem valor" : moeda.format(v));

const entrada = "w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

export function ImportarAgenda() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [escolhas, setEscolhas] = useState<Escolhas>({ convenios: {}, profissionais: {} });
  const [meses, setMeses] = useState<Set<string>>(new Set());
  const [trabalhando, setTrabalhando] = useState<"analisando" | "importando" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [importado, setImportado] = useState<Record<string, Partial<Record<Acao, number>>> | null>(null);

  const formulario = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("arquivo", arquivo!);
    f.set("escolhas", JSON.stringify(escolhas));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };

  async function analisar(novoArquivo = arquivo, novasEscolhas = escolhas) {
    if (!novoArquivo) return;
    setTrabalhando("analisando");
    setErro(null);
    setImportado(null);
    const f = new FormData();
    f.set("arquivo", novoArquivo);
    f.set("escolhas", JSON.stringify(novasEscolhas));
    const r = await analisarImportacao(f).catch(() => ({ ok: false as const, erro: "Falha de conexão (o arquivo pode ser grande demais)." }));
    setTrabalhando(null);
    if (!r.ok) {
      setAnalise(null);
      return setErro(r.erro);
    }
    setAnalise(r);
    // Plano sugerido já vem escolhido (a pessoa confere e pode trocar).
    const sugeridos = Object.fromEntries(r.pendencias.convenios.filter((c) => c.sugestao).map((c) => [c.chave, c.sugestao!]));
    setEscolhas((atual) => ({ ...atual, convenios: { ...sugeridos, ...atual.convenios } }));
    setMeses(new Set(r.meses.map((m) => m.mes)));
  }

  async function importar() {
    setTrabalhando("importando");
    setErro(null);
    const r = await importarAgenda(formulario({ meses: JSON.stringify([...meses]) })).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setTrabalhando(null);
    if (!r.ok) return setErro(r.erro);
    setImportado(r.contagens);
    setAnalise(null);
  }

  const pendente = !!analise && (analise.pendencias.convenios.length > 0 || analise.pendencias.profissionais.length > 0);
  const escolhasCompletas =
    !!analise &&
    analise.pendencias.convenios.every((c) => c.chave in escolhas.convenios) &&
    analise.pendencias.profissionais.every((p) => escolhas.profissionais[p.chave]);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 text-sm shadow-sm ring-1 ring-black/5">
        <span className="font-medium">Relatório de agendamentos</span>
        <input
          type="file"
          accept=".xlsx"
          aria-label="Arquivo do relatório"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setArquivo(f);
            setAnalise(null);
            setImportado(null);
            void analisar(f);
          }}
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {trabalhando === "analisando" && <span className="text-muted">Analisando…</span>}
      </label>

      {erro && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger ring-1 ring-red-200">
          {erro}
        </p>
      )}

      {analise && pendente && (
        <section aria-label="Correspondências" className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">
            Confira a correspondência de cada convênio e valor, e dos profissionais não reconhecidos. Fica guardada para as próximas importações.
          </p>
          {analise.pendencias.convenios.map((c) => (
            <label key={c.chave} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
              <span>
                Convênio <strong>{c.nome}</strong> · {valorDoConvenio(c.valor)} <span className="text-muted">({c.quantidade} atendimentos{c.sugestao ? ", plano sugerido" : ""})</span>
              </span>
              <select
                aria-label={`Plano para o convênio ${c.nome} · ${valorDoConvenio(c.valor)}`}
                value={escolhas.convenios[c.chave] ?? "?"}
                onChange={(e) => setEscolhas({ ...escolhas, convenios: { ...escolhas.convenios, [c.chave]: e.target.value } })}
                className={entrada}
              >
                <option value="?" disabled>
                  Escolher…
                </option>
                <option value="">Sem plano</option>
                {analise.opcoes.planos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {analise.pendencias.profissionais.map((p) => (
            <label key={p.chave} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
              <span>
                Profissional <strong>{p.nome}</strong> <span className="text-muted">({p.quantidade} atendimentos)</span>
              </span>
              <select
                aria-label={`Profissional do app para ${p.nome}`}
                value={escolhas.profissionais[p.chave] ?? ""}
                onChange={(e) => setEscolhas({ ...escolhas, profissionais: { ...escolhas.profissionais, [p.chave]: e.target.value } })}
                className={entrada}
              >
                <option value="" disabled>
                  Escolher…
                </option>
                <option value="novo">Cadastrar como novo profissional</option>
                {analise.opcoes.profissionais.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={!escolhasCompletas || trabalhando !== null}
            onClick={() => void analisar()}
            className="self-start rounded-full bg-amber-900 px-4 py-2 font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            Continuar
          </button>
        </section>
      )}

      {analise && !pendente && (
        <section aria-label="Resumo da importação" className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 font-medium">Mês</th>
                  <th className="px-3 py-2 font-medium">No arquivo</th>
                  {COLUNAS.map(([, rotulo, dica]) => (
                    <th key={rotulo} className="px-3 py-2 font-medium" title={dica}>
                      {rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analise.meses.map((m) => (
                  <tr key={m.mes} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <label className="flex cursor-pointer items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={meses.has(m.mes)}
                          onChange={(e) => {
                            const novo = new Set(meses);
                            if (e.target.checked) novo.add(m.mes);
                            else novo.delete(m.mes);
                            setMeses(novo);
                          }}
                          className="size-4 accent-[var(--accent)]"
                        />
                        {nomeDoMes(`${m.mes}-01`)}
                      </label>
                    </td>
                    <td className="px-3 py-2 text-muted tabular-nums">
                      {m.linhas} <span className="text-xs">({m.linhas - m.validas} apagados)</span>
                    </td>
                    {COLUNAS.map(([acao]) => (
                      <td key={acao} className="px-3 py-2 tabular-nums">
                        {m.contagens?.[acao] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(analise.pacientesNovos > 0 || analise.tiposNovos.length > 0) && (
            <p className="text-xs text-muted">
              {analise.pacientesNovos > 0 && `${analise.pacientesNovos} paciente${analise.pacientesNovos === 1 ? "" : "s"} ainda não cadastrado${analise.pacientesNovos === 1 ? "" : "s"} será${analise.pacientesNovos === 1 ? "" : "ão"} criado${analise.pacientesNovos === 1 ? "" : "s"}. `}
              {analise.tiposNovos.length > 0 && `Tipos novos: ${analise.tiposNovos.join(", ")}.`}
            </p>
          )}
          <p className="text-xs text-muted">Nada foi gravado ainda. Marque os meses e importe.</p>
          <button
            type="button"
            disabled={meses.size === 0 || trabalhando !== null}
            onClick={() => void importar()}
            className="self-start rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {trabalhando === "importando" ? "Importando…" : `Importar ${meses.size} ${meses.size === 1 ? "mês" : "meses"}`}
          </button>
        </section>
      )}

      {importado && (
        <section role="status" aria-label="Resultado da importação" className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-4 text-sm text-accent">
          <p className="font-semibold">Importação concluída.</p>
          <ul>
            {Object.entries(importado)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([mes, c]) => (
                <li key={mes}>
                  {nomeDoMes(`${mes}-01`)}: {COLUNAS.map(([acao, rotulo]) => `${c[acao] ?? 0} ${rotulo.toLowerCase()}`).join(" · ")}
                </li>
              ))}
          </ul>
          <Link href="/agenda" className="self-start font-medium underline underline-offset-2">
            Ver na agenda
          </Link>
        </section>
      )}
    </div>
  );
}
