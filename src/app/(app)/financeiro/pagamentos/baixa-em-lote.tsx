"use client";

// Baixa do saldo (glosa do convênio, desconto, perdão) nos atendimentos
// selecionados: por padrão, todo o saldo de cada um; o valor de cada um é editável.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { lerValor } from "@/lib/agenda/valores";
import { MOTIVOS_DE_BAIXA, saldo, type AtendimentoFinanceiro, type MotivoDeBaixa } from "@/lib/financeiro/calculos";
import { darBaixa } from "../actions";
import { dataCurta, entrada, moeda } from "../comum";

const formatar = (n: number) => n.toFixed(2).replace(".", ",");

export function BaixaEmLote({
  itens,
  hoje,
  aoFechar,
  aoCancelar,
}: {
  itens: AtendimentoFinanceiro[];
  hoje: string;
  aoFechar: () => void;
  aoCancelar: () => void;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Map<string, string>>(new Map(itens.map((a) => [a.id, formatar(saldo(a))])));
  const [motivo, setMotivo] = useState<MotivoDeBaixa>("glosa");
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const total = [...valores.values()].reduce((t, v) => t + (lerValor(v) ?? 0), 0);

  async function salvar() {
    const lista = [...valores].map(([atendimentoId, v]) => ({
      atendimentoId,
      valor: lerValor(v) ?? NaN,
    }));
    if (lista.some((i) => !(i.valor > 0))) return setErro("Valor inválido num dos atendimentos.");
    setSalvando(true);
    setErro(null);
    const r = await darBaixa({ data, motivo, observacao, itens: lista }).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
    aoFechar();
  }

  return (
    <form
      aria-label="Dar baixa no saldo"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      className="flex flex-col gap-4 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5"
    >
      <div>
        <h2 className="font-semibold">Dar baixa no saldo</h2>
        <p className="text-sm text-muted">
          O valor deixa de ficar em aberto, sem entrar no caixa. Use para glosa do convênio, desconto ou dívida perdoada.
        </p>
      </div>

      <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-2xl ring-1 ring-black/5">
        {itens.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 tabular-nums">{dataCurta(a.data)}</span>
            <span className="min-w-0 flex-1 truncate">
              {a.paciente?.nome ?? "—"} <span className="text-xs text-muted">· {a.plano?.nome ?? "sem plano"}</span>
            </span>
            <span className="text-xs text-muted tabular-nums">em aberto {moeda.format(saldo(a))}</span>
            <input
              value={valores.get(a.id)}
              onChange={(e) => setValores((m) => new Map(m).set(a.id, e.target.value))}
              inputMode="decimal"
              aria-label={`Baixa em ${dataCurta(a.data)} ${a.paciente?.nome ?? ""}`}
              className={`${entrada} w-24 py-1 text-right`}
            />
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Motivo</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoDeBaixa)} className={entrada}>
            {MOTIVOS_DE_BAIXA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Observação</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: nº do demonstrativo" className={entrada} />
        </label>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : `Dar baixa de ${moeda.format(total)}`}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Cancelar
        </button>
      </div>
    </form>
  );
}
