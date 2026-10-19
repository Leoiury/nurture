"use client";

// Despesas do mês (pelo vencimento): cadastro, edição, marcar como paga e excluir.
// Despesas recorrentes: lançadas todo mês no dia escolhido; editar ou encerrar
// o modelo muda só os lançamentos ainda não pagos a partir deste mês.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { nomeDoMes } from "@/lib/agenda/tempo";
import { lerValor } from "@/lib/agenda/valores";
import type { DespesaFinanceira, DespesaRecorrente } from "@/lib/financeiro/calculos";
import { alterarRecorrente, excluirDespesa, marcarDespesaPaga, salvarDespesa } from "../actions";
import { dataCurta, entrada, moeda } from "../comum";

type Filtro = "todas" | "em-aberto" | "pagas";

export function Despesas({
  despesas,
  recorrentes,
  categorias,
  dataPadrao,
  hoje,
}: {
  despesas: DespesaFinanceira[];
  recorrentes: DespesaRecorrente[];
  categorias: string[];
  dataPadrao: string;
  hoje: string;
}) {
  const router = useRouter();
  // null = fechado; "nova" = cadastro; id = edição.
  const [editando, setEditando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = despesas.filter((d) => filtro === "todas" || (filtro === "pagas" ? d.pagaEm : !d.pagaEm));
  const total = (lista: DespesaFinanceira[]) => lista.reduce((t, d) => t + d.valor, 0);

  async function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    const r = await acao().catch(() => ({
      ok: false as const,
      erro: "Falha de conexão.",
    }));
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Situação" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
          {(
            [
              ["todas", "Todas", despesas],
              ["em-aberto", "Em aberto", despesas.filter((d) => !d.pagaEm)],
              ["pagas", "Pagas", despesas.filter((d) => d.pagaEm)],
            ] as const
          ).map(([v, rotulo, lista]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={filtro === v}
              onClick={() => setFiltro(v)}
              className={`rounded-full px-3 py-1 ${filtro === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {rotulo} <span className="text-xs text-muted tabular-nums">{moeda.format(total(lista))}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEditando("nova")}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Nova despesa
        </button>
      </div>

      {editando === "nova" && <FormDespesa categorias={categorias} inicial={null} dataPadrao={dataPadrao} aoFechar={() => setEditando(null)} />}
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhuma despesa.</p>
      ) : (
        <ul aria-label="Despesas" className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          {visiveis.map((d) =>
            editando === d.id ? (
              <li key={d.id} className="p-2">
                <FormDespesa categorias={categorias} inicial={d} dataPadrao={dataPadrao} aoFechar={() => setEditando(null)} />
              </li>
            ) : (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-despesa={d.descricao}>
                <span className="w-12 shrink-0 text-muted tabular-nums">{dataCurta(d.data)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {d.descricao}
                    {d.recorrente && (
                      <span
                        className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-normal text-accent"
                        title="Lançada por uma despesa recorrente"
                      >
                        ↻ todo mês
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">{[d.categoria, d.observacao].filter(Boolean).join(" · ") || "—"}</span>
                </span>
                <span className="font-medium tabular-nums">{moeda.format(d.valor)}</span>
                {d.pagaEm ? (
                  <button
                    type="button"
                    onClick={() => void executar(() => marcarDespesaPaga(d.id, null))}
                    title="Voltar para em aberto"
                    className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 hover:brightness-95"
                  >
                    Paga em {dataCurta(d.pagaEm)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void executar(() => marcarDespesaPaga(d.id, hoje))}
                    className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium hover:bg-black/[0.07]"
                  >
                    Marcar como paga
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditando(d.id)}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => confirm(`Excluir a despesa "${d.descricao}"?`) && void executar(() => excluirDespesa(d.id))}
                  aria-label={`Excluir ${d.descricao}`}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-danger"
                >
                  Excluir
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {recorrentes.length > 0 && <Recorrentes recorrentes={recorrentes} categorias={categorias} hoje={hoje} />}
    </>
  );
}

/** "2026-12-01" → "2026-12" (input type=month) e de volta. */
const paraMes = (data: string | null) => (data ? data.slice(0, 7) : "");
const doMes = (mes: string) => (mes ? `${mes}-01` : null);

function Recorrentes({ recorrentes, categorias, hoje }: { recorrentes: DespesaRecorrente[]; categorias: string[]; hoje: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const mesAtual = `${hoje.slice(0, 7)}-01`;

  async function encerrar(r: DespesaRecorrente) {
    // Encerra neste mês (ou no primeiro, se ainda não começou).
    const fim = r.inicio > mesAtual ? r.inicio : mesAtual;
    if (
      !confirm(
        `Encerrar "${r.descricao}"? O último lançamento será o de ${nomeDoMes(fim).toLowerCase()}; os seguintes ainda não pagos são removidos.`,
      )
    )
      return;
    setErro(null);
    const res = await alterarRecorrente(r.id, {
      descricao: r.descricao,
      categoria: r.categoria ?? "",
      valor: r.valor,
      dia: r.dia,
      fim,
    }).catch(() => ({
      ok: false as const,
      erro: "Falha de conexão.",
    }));
    if (!res.ok) return setErro(res.erro);
    router.refresh();
  }

  return (
    <section aria-label="Despesas recorrentes" className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-medium text-muted">Despesas recorrentes</h2>
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
        {recorrentes.map((r) =>
          editando === r.id ? (
            <li key={r.id} className="p-2">
              <FormRecorrente recorrente={r} categorias={categorias} aoFechar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-recorrente={r.descricao}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.descricao}</span>
                <span className="block truncate text-xs text-muted">
                  {[`Todo dia ${r.dia}`, r.fim ? `até ${nomeDoMes(r.fim).toLowerCase()}` : "sem data para acabar", r.categoria]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="font-medium tabular-nums">{moeda.format(r.valor)}</span>
              <button
                type="button"
                onClick={() => setEditando(r.id)}
                className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => void encerrar(r)}
                className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-danger"
              >
                Encerrar
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function FormRecorrente({ recorrente: r, categorias, aoFechar }: { recorrente: DespesaRecorrente; categorias: string[]; aoFechar: () => void }) {
  const router = useRouter();
  const [descricao, setDescricao] = useState(r.descricao);
  const [categoria, setCategoria] = useState(r.categoria ?? "");
  const [valor, setValor] = useState(r.valor.toFixed(2).replace(".", ","));
  const [dia, setDia] = useState(String(r.dia));
  const [fim, setFim] = useState(paraMes(r.fim));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    const v = lerValor(valor);
    if (v === null || Number.isNaN(v)) return setErro("Informe o valor.");
    setSalvando(true);
    setErro(null);
    const res = await alterarRecorrente(r.id, {
      descricao,
      categoria,
      valor: v,
      dia: Number(dia),
      fim: doMes(fim),
    }).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!res.ok) return setErro(res.erro);
    router.refresh();
    aoFechar();
  }

  return (
    <form
      aria-label="Editar despesa recorrente"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5"
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_1fr_0.7fr_1.2fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Descrição</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Categoria</span>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="categorias-de-despesa" className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Valor</span>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Dia</span>
          <input type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Até (vazio = sem fim)</span>
          <input type="month" value={fim} onChange={(e) => setFim(e.target.value)} className={entrada} />
        </label>
      </div>
      <datalist id="categorias-de-despesa">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <p className="text-xs text-muted">Muda os lançamentos ainda não pagos deste mês em diante. Os meses passados e os já pagos ficam como estão.</p>
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormDespesa({
  categorias,
  inicial,
  dataPadrao,
  aoFechar,
}: {
  categorias: string[];
  inicial: DespesaFinanceira | null;
  dataPadrao: string;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [categoria, setCategoria] = useState(inicial?.categoria ?? "");
  const [valor, setValor] = useState(inicial ? inicial.valor.toFixed(2).replace(".", ",") : "");
  const [data, setData] = useState(inicial?.data ?? dataPadrao);
  const [paga, setPaga] = useState(inicial ? !!inicial.pagaEm : false);
  const [pagaEm, setPagaEm] = useState(inicial?.pagaEm ?? dataPadrao);
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [repetir, setRepetir] = useState(false);
  const [repetirAte, setRepetirAte] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    const v = lerValor(valor);
    if (v === null || Number.isNaN(v)) return setErro("Informe o valor.");
    setSalvando(true);
    setErro(null);
    const r = await salvarDespesa(inicial?.id ?? null, {
      data,
      descricao,
      categoria,
      valor: v,
      pagaEm: paga ? pagaEm : null,
      observacao,
      repetir: repetir ? { ate: doMes(repetirAte) } : null,
    }).catch(() => ({
      ok: false as const,
      erro: "Falha de conexão.",
    }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
    aoFechar();
  }

  return (
    <form
      aria-label={inicial ? "Editar despesa" : "Nova despesa"}
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5"
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_1fr_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Descrição</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Categoria</span>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="categorias-de-despesa" className={entrada} />
          <datalist id="categorias-de-despesa">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Valor</span>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Vencimento</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={entrada} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={paga} onChange={(e) => setPaga(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Já foi paga
        </label>
        {paga && <input type="date" value={pagaEm} onChange={(e) => setPagaEm(e.target.value)} aria-label="Paga em" className={entrada} />}
        {!inicial && (
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Repetir todo mês{data && ` (dia ${Number(data.slice(8, 10))})`}
          </label>
        )}
        {!inicial && repetir && (
          <label className="flex items-center gap-2 text-muted">
            até
            <input type="month" value={repetirAte} onChange={(e) => setRepetirAte(e.target.value)} aria-label="Repetir até" className={entrada} />
            <span className="text-xs">(vazio = sem fim)</span>
          </label>
        )}
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observação"
          aria-label="Observação"
          className={`${entrada} min-w-48 flex-1`}
        />
      </div>
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar despesa"}
        </button>
        <button type="button" onClick={aoFechar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Cancelar
        </button>
      </div>
    </form>
  );
}
