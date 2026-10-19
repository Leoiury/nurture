"use client";

// Atendimentos do mês com valores: filtros (status, pagamento, planos,
// profissional, paciente), ordenação pelos cabeçalhos e agrupamento com subtotais.
// Os cards do painel abrem esta tela já com certos filtros (pela URL).
// Seleção em lote (um a um ou todos os em aberto visíveis) para registrar um
// pagamento único (ex.: o convênio paga tudo de uma vez) ou dar baixa no saldo.

import { useMemo, useState } from "react";
import { paraBusca } from "@/lib/pacientes";
import {
  SITUACOES,
  agrupar,
  ordenar,
  saldo,
  situacaoDePagamento,
  type Agrupamento,
  type AtendimentoFinanceiro,
  type Ordem,
  type SituacaoDePagamento,
} from "@/lib/financeiro/calculos";
import { PAGAMENTOS, STATUS, passaNoPagamento, passaNoStatus, type FiltroDePagamento, type Filtros } from "@/lib/financeiro/filtros";
import { dataCurta, entrada, moeda } from "../comum";
import { BaixaEmLote } from "../pagamentos/baixa-em-lote";
import { RegistrarPagamento, type Origem } from "../pagamentos/registrar-pagamento";

const AGRUPAMENTOS: [Agrupamento | "", string][] = [
  ["", "Sem agrupar"],
  ["plano", "Por plano"],
  ["paciente", "Por paciente"],
  ["profissional", "Por profissional"],
];

const ROTULO_DO_STATUS: Record<AtendimentoFinanceiro["status"], string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  atendido: "Realizado",
  faltou: "Faltou",
  desmarcado: "Desmarcado",
};

const COR_DA_SITUACAO: Record<SituacaoDePagamento, string> = {
  pago: "bg-emerald-50 text-emerald-800",
  parcial: "bg-amber-50 text-amber-800",
  nao_pago: "bg-red-50 text-red-800",
  baixado: "bg-sky-50 text-sky-800",
  sem_valor: "bg-black/5 text-muted",
};

const COLUNAS: { ordem: Ordem | null; rotulo: string; direita?: boolean }[] = [
  { ordem: "data", rotulo: "Data" },
  { ordem: "paciente", rotulo: "Paciente" },
  { ordem: null, rotulo: "Profissional" },
  { ordem: "plano", rotulo: "Plano" },
  { ordem: null, rotulo: "Status" },
  { ordem: "valor", rotulo: "Valor", direita: true },
  { ordem: null, rotulo: "Recebido", direita: true },
  { ordem: "saldo", rotulo: "A receber", direita: true },
];

/** Quem paga o lote: o paciente (se todos forem do mesmo), senão o plano (se todos forem do mesmo). */
function origemDoLote(itens: AtendimentoFinanceiro[]): Origem {
  const pacientes = new Set(itens.map((a) => a.paciente?.id ?? ""));
  const planos = new Set(itens.map((a) => a.plano?.id ?? ""));
  if (pacientes.size === 1 && itens[0].paciente)
    return {
      tipo: "paciente",
      id: itens[0].paciente.id,
      nome: itens[0].paciente.nome,
      marcarTodos: true,
    };
  if (planos.size === 1 && itens[0].plano)
    return {
      tipo: "plano",
      id: itens[0].plano.id,
      nome: itens[0].plano.nome,
      marcarTodos: true,
    };
  return { tipo: "plano", id: null, nome: "", marcarTodos: true };
}

export function ListaFinanceira({
  atendimentos,
  planos,
  inicial,
  hoje,
}: {
  atendimentos: AtendimentoFinanceiro[];
  planos: { id: string; nome: string; cor: string }[];
  inicial: Filtros;
  hoje: string;
}) {
  const [filtros, setFiltros] = useState(inicial);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [acao, setAcao] = useState<"pagar" | "baixa" | null>(null);
  const [profissional, setProfissional] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ por: Ordem; crescente: boolean }>({
    por: "data",
    crescente: true,
  });
  const mudar = (parcial: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...parcial }));

  const profissionais = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of atendimentos) for (const p of a.profissionais) m.set(p.id, p.nome);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [atendimentos]);
  // Só os planos que aparecem no mês.
  const planosDoMes = planos.filter((p) => atendimentos.some((a) => a.plano?.id === p.id));

  const visiveis = useMemo(() => {
    const termo = paraBusca(busca);
    const lista = atendimentos.filter(
      (a) =>
        passaNoStatus(a, filtros.status) &&
        passaNoPagamento(a, filtros.pagamento) &&
        (filtros.planos.length === 0 || filtros.planos.includes(a.plano?.id ?? "")) &&
        (!profissional || a.profissionais.some((p) => p.id === profissional)) &&
        (!termo || paraBusca(a.paciente?.nome ?? "").includes(termo)),
    );
    return ordenar(lista, ordem.por, ordem.crescente);
  }, [atendimentos, filtros, profissional, busca, ordem]);

  const grupos = filtros.agrupar ? agrupar(visiveis, filtros.agrupar) : [{ chave: "todos", rotulo: "", cor: null, itens: visiveis }];
  // Só atendimentos com saldo podem ser selecionados.
  const selecionaveis = visiveis.filter((a) => saldo(a) > 0);
  const todosSelecionados = selecionaveis.length > 0 && selecionaveis.every((a) => selecionados.has(a.id));
  const lote = atendimentos.filter((a) => selecionados.has(a.id) && saldo(a) > 0);
  const alternar = (id: string) =>
    setSelecionados((s) => {
      const novo = new Set(s);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  const concluir = () => {
    setAcao(null);
    setSelecionados(new Set());
  };
  const ativos = filtros.planos.length + (profissional ? 1 : 0) + (busca ? 1 : 0) + (filtros.pagamento !== "todos" ? 1 : 0);

  return (
    <>
      <div className="flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-black/5" role="group" aria-label="Filtros">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
            {STATUS.map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={filtros.status === v}
                onClick={() => mudar({ status: v })}
                className={`rounded-full px-3 py-1 ${filtros.status === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            Pagamento
            <select value={filtros.pagamento} onChange={(e) => mudar({ pagamento: e.target.value as FiltroDePagamento })} className={entrada}>
              {PAGAMENTOS.map(([v, rotulo]) => (
                <option key={v} value={v}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Agrupar
            <select
              value={filtros.agrupar ?? ""}
              onChange={(e) =>
                mudar({
                  agrupar: (e.target.value || null) as Agrupamento | null,
                })
              }
              className={entrada}
            >
              {AGRUPAMENTOS.map(([v, rotulo]) => (
                <option key={v} value={v}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente"
            aria-label="Buscar paciente"
            className={`${entrada} w-56`}
          />
          <select value={profissional} onChange={(e) => setProfissional(e.target.value)} aria-label="Profissional" className={entrada}>
            <option value="">Todos os profissionais</option>
            {profissionais.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          {ativos > 0 && (
            <button
              type="button"
              onClick={() => {
                mudar({ planos: [], pagamento: "todos" });
                setProfissional("");
                setBusca("");
              }}
              className="rounded-full px-3 py-1.5 text-sm text-accent hover:bg-accent-soft"
            >
              Limpar filtros
            </button>
          )}
        </div>
        {planosDoMes.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Planos">
            {planosDoMes.map((p) => {
              const marcado = filtros.planos.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() =>
                    mudar({
                      planos: marcado ? filtros.planos.filter((x) => x !== p.id) : [...filtros.planos, p.id],
                    })
                  }
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 transition ${marcado ? "bg-accent-soft font-medium ring-accent/40" : "text-muted ring-black/10 hover:text-foreground"}`}
                >
                  <span className="size-2 rounded-full" style={{ background: p.cor }} aria-hidden />
                  {p.nome}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Totais lista={visiveis} />

      {acao === "pagar" && (
        <RegistrarPagamento
          key={[...selecionados].join()}
          origem={origemDoLote(lote)}
          itens={lote}
          planos={planos}
          hoje={hoje}
          aoFechar={concluir}
          aoCancelar={() => setAcao(null)}
        />
      )}
      {acao === "baixa" && (
        <BaixaEmLote key={[...selecionados].join()} itens={lote} hoje={hoje} aoFechar={concluir} aoCancelar={() => setAcao(null)} />
      )}

      {visiveis.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhum atendimento com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-background text-left text-xs text-muted">
              <tr>
                <th scope="col" className="w-8 py-2 pl-3">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    disabled={selecionaveis.length === 0}
                    onChange={() => setSelecionados(todosSelecionados ? new Set() : new Set(selecionaveis.map((a) => a.id)))}
                    aria-label="Selecionar todos em aberto"
                    className="size-4 accent-[var(--accent)]"
                  />
                </th>
                {COLUNAS.map((c) => (
                  <th
                    key={c.rotulo}
                    scope="col"
                    className={`px-3 py-2 font-medium ${c.direita ? "text-right" : ""}`}
                    aria-sort={c.ordem && ordem.por === c.ordem ? (ordem.crescente ? "ascending" : "descending") : undefined}
                  >
                    {c.ordem ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOrdem((o) => ({
                            por: c.ordem!,
                            crescente: o.por === c.ordem ? !o.crescente : c.ordem === "data" || c.ordem === "paciente" || c.ordem === "plano",
                          }))
                        }
                        className="hover:text-foreground"
                      >
                        {c.rotulo}
                        {ordem.por === c.ordem && <span aria-hidden> {ordem.crescente ? "↑" : "↓"}</span>}
                      </button>
                    ) : (
                      c.rotulo
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.chave} className="divide-y divide-border border-t border-border" aria-label={g.rotulo || undefined}>
                {filtros.agrupar && (
                  <tr className="bg-black/[0.02] font-medium" data-grupo={g.rotulo}>
                    <td colSpan={6} className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {g.cor && <span className="size-2.5 rounded-full" style={{ background: g.cor }} aria-hidden />}
                        {g.rotulo}
                        <span className="text-xs font-normal text-muted">{g.itens.length}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{moeda.format(g.itens.reduce((t, a) => t + (a.valor ?? 0), 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moeda.format(g.itens.reduce((t, a) => t + a.recebido, 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moeda.format(g.itens.reduce((t, a) => t + saldo(a), 0))}</td>
                  </tr>
                )}
                {g.itens.map((a) => {
                  const s = situacaoDePagamento(a);
                  return (
                    <tr key={`${g.chave}-${a.id}`} data-atendimento={a.id} className={selecionados.has(a.id) ? "bg-accent-soft/60" : undefined}>
                      <td className="py-2 pl-3">
                        {saldo(a) > 0 && (
                          <input
                            type="checkbox"
                            checked={selecionados.has(a.id)}
                            onChange={() => alternar(a.id)}
                            aria-label={`Selecionar ${dataCurta(a.data)} ${a.paciente?.nome ?? ""}`}
                            className="size-4 accent-[var(--accent)]"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataCurta(a.data)}</td>
                      <td className="max-w-48 truncate px-3 py-2">{a.paciente?.nome ?? "—"}</td>
                      <td className="max-w-40 truncate px-3 py-2 text-muted">{a.profissionais.map((p) => p.nome).join(" + ") || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {a.plano && <span className="size-2 shrink-0 rounded-full" style={{ background: a.plano.cor }} aria-hidden />}
                          {a.plano?.nome ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted">{ROTULO_DO_STATUS[a.status]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.valor === null ? "—" : moeda.format(a.valor)}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums text-muted"
                        title={a.baixado ? `Baixa: ${moeda.format(a.baixado)}` : undefined}
                      >
                        {a.recebido ? moeda.format(a.recebido) : "—"}
                        {a.baixado > 0 && <span className="block text-xs text-sky-700">baixa {moeda.format(a.baixado)}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap tabular-nums ${COR_DA_SITUACAO[s]}`}>
                          {s === "nao_pago" || s === "parcial" ? moeda.format(saldo(a)) : SITUACOES.find((x) => x.valor === s)!.rotulo}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {lote.length > 0 && !acao && (
        <div
          role="region"
          aria-label="Seleção"
          className="sticky bottom-4 z-10 mx-auto flex flex-wrap items-center gap-3 rounded-full bg-foreground py-2 pr-2 pl-5 text-sm text-white shadow-lg"
        >
          <span>
            {lote.length} selecionado{lote.length === 1 ? "" : "s"} ·{" "}
            <strong className="tabular-nums">{moeda.format(lote.reduce((t, a) => t + saldo(a), 0))}</strong> a receber
          </span>
          <button type="button" onClick={() => setAcao("pagar")} className="rounded-full bg-accent px-4 py-1.5 font-medium hover:brightness-110">
            Registrar pagamento
          </button>
          <button type="button" onClick={() => setAcao("baixa")} className="rounded-full bg-white/15 px-4 py-1.5 font-medium hover:bg-white/25">
            Dar baixa no saldo
          </button>
          <button
            type="button"
            onClick={() => setSelecionados(new Set())}
            aria-label="Limpar seleção"
            className="rounded-full px-3 py-1.5 text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function Totais({ lista }: { lista: AtendimentoFinanceiro[] }) {
  const valor = lista.reduce((t, a) => t + (a.valor ?? 0), 0);
  const recebido = lista.reduce((t, a) => t + a.recebido, 0);
  const aReceber = lista.reduce((t, a) => t + saldo(a), 0);
  return (
    <dl role="status" aria-label="Totais" className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-sm">
      {(
        [
          ["Atendimentos", String(lista.length)],
          ["Valor", moeda.format(valor)],
          ["Recebido", moeda.format(recebido)],
          ["A receber", moeda.format(aReceber)],
        ] as const
      ).map(([rotulo, v]) => (
        <div key={rotulo} className="flex gap-1.5">
          <dt className="text-muted">{rotulo}:</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
