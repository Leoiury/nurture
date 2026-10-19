"use client";

// Registro de um pagamento recebido: de um paciente ou de um plano (convênio),
// marcando quais atendimentos em aberto ele quita (inteiros ou em parte).
// O valor recebido acompanha a soma dos marcados até ser digitado à mão.
// Com `itens` (seleção em lote na lista), a lista é a seleção, e escolher o
// paciente/plano só informa de quem veio o pagamento.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { lerValor } from "@/lib/agenda/valores";
import { FORMAS, ehFalta, saldo, type AtendimentoFinanceiro, type Forma } from "@/lib/financeiro/calculos";
import { paraBusca } from "@/lib/pacientes";
import { atendimentosPendentes, pacientesParaPagamento, registrarPagamento } from "../actions";
import { dataCurta, entrada, moeda } from "../comum";

export type Origem = {
  tipo: "paciente" | "plano";
  id: string | null;
  nome: string;
  /** Já abrir com todos os atendimentos em aberto marcados. */
  marcarTodos: boolean;
};

const formatar = (n: number) => n.toFixed(2).replace(".", ",");

export function RegistrarPagamento({
  origem,
  itens,
  planos,
  hoje,
  aoFechar,
  aoCancelar = aoFechar,
}: {
  origem: Origem;
  itens?: AtendimentoFinanceiro[];
  planos: { id: string; nome: string }[];
  hoje: string;
  aoFechar: () => void;
  aoCancelar?: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState(origem.tipo);
  const [escolhido, setEscolhido] = useState<{
    id: string;
    nome: string;
  } | null>(origem.id ? { id: origem.id, nome: origem.nome } : null);
  const [pendentes, setPendentes] = useState<AtendimentoFinanceiro[] | null>(itens ?? null);
  // Atendimento marcado → valor quitado (texto, editável).
  const [marcados, setMarcados] = useState<Map<string, string>>(new Map((itens ?? []).map((a) => [a.id, formatar(saldo(a))])));
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const [data, setData] = useState(hoje);
  const [forma, setForma] = useState<Forma>("pix");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!escolhido || itens) return;
    let ativo = true;
    atendimentosPendentes(tipo === "paciente" ? { pacienteId: escolhido.id } : { planoId: escolhido.id })
      .then((lista) => {
        if (!ativo) return;
        setPendentes(lista);
        setMarcados(origem.marcarTodos && origem.id === escolhido.id ? new Map(lista.map((a) => [a.id, formatar(saldo(a))])) : new Map());
      })
      .catch(() => ativo && setErro("Não foi possível carregar os atendimentos em aberto."));
    return () => {
      ativo = false;
    };
  }, [escolhido, tipo, origem, itens]);

  const somaMarcados = useMemo(() => [...marcados.values()].reduce((t, v) => t + (lerValor(v) ?? 0), 0), [marcados]);
  const valor = valorDigitado ?? (somaMarcados ? formatar(somaMarcados) : "");

  function alternar(a: AtendimentoFinanceiro) {
    setMarcados((m) => {
      const novo = new Map(m);
      if (novo.has(a.id)) novo.delete(a.id);
      else novo.set(a.id, formatar(saldo(a)));
      return novo;
    });
  }

  async function salvar() {
    const total = lerValor(valor);
    if (total === null || Number.isNaN(total) || total <= 0) return setErro("Informe o valor recebido.");
    const itens = [...marcados].map(([atendimentoId, v]) => ({
      atendimentoId,
      valor: lerValor(v) ?? NaN,
    }));
    if (itens.some((i) => !(i.valor > 0))) return setErro("Valor inválido num dos atendimentos.");
    if (itens.reduce((t, i) => t + i.valor, 0) > total + 0.005) return setErro("A soma dos atendimentos passa do valor recebido.");
    setSalvando(true);
    setErro(null);
    const r = await registrarPagamento({
      data,
      valor: total,
      forma,
      pacienteId: tipo === "paciente" ? (escolhido?.id ?? null) : null,
      planoId: tipo === "plano" ? (escolhido?.id ?? null) : null,
      observacao,
      itens,
    }).catch(() => ({ ok: false as const, erro: "Falha de conexão." }));
    setSalvando(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
    aoFechar();
  }

  return (
    <form
      aria-label="Registrar pagamento"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      className="flex flex-col gap-4 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Registrar pagamento</h2>
        <div role="radiogroup" aria-label="Pagamento de" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
          {(
            [
              ["paciente", "Paciente"],
              ["plano", "Plano / convênio"],
            ] as const
          ).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={tipo === v}
              onClick={() => {
                setTipo(v);
                setEscolhido(null);
                if (itens) return;
                setPendentes(null);
                setMarcados(new Map());
              }}
              className={`rounded-full px-3 py-1 ${tipo === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {tipo === "paciente" ? (
        <EscolherPaciente
          escolhido={escolhido}
          aoEscolher={(p) => {
            setEscolhido(p);
            if (!itens) setPendentes(null);
          }}
        />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Plano</span>
          <select
            value={escolhido?.id ?? ""}
            onChange={(e) => {
              const p = planos.find((x) => x.id === e.target.value);
              setEscolhido(p ?? null);
              if (!itens) setPendentes(null);
            }}
            className={`${entrada} max-w-sm`}
          >
            <option value="">{itens ? "Não informar" : "Escolha o plano"}</option>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}

      {(escolhido || itens) && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex w-full items-center justify-between text-sm text-muted">
            <span>{itens ? "Atendimentos selecionados" : "Atendimentos em aberto (realizados e faltas, de qualquer mês)"}</span>
            {pendentes && pendentes.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setMarcados(marcados.size === pendentes.length ? new Map() : new Map(pendentes.map((a) => [a.id, formatar(saldo(a))])))
                }
                className="text-xs text-accent hover:underline"
              >
                {marcados.size === pendentes.length ? "Desmarcar todos" : "Marcar todos"}
              </button>
            )}
          </legend>
          {pendentes === null ? (
            <p className="text-sm text-muted">Carregando…</p>
          ) : pendentes.length === 0 ? (
            <p className="text-sm text-muted">Nenhum atendimento em aberto. O pagamento fica registrado sem vínculo.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-2xl ring-1 ring-black/5">
              {pendentes.map((a) => {
                const marcado = marcados.has(a.id);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(a)}
                      aria-label={`Quitar ${dataCurta(a.data)} ${a.paciente?.nome ?? ""}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="w-12 shrink-0 tabular-nums">{dataCurta(a.data)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {itens ? `${a.paciente?.nome ?? "—"} · ${a.plano?.nome ?? "sem plano"}` : tipo === "plano" ? a.paciente?.nome : a.plano?.nome}
                      {ehFalta(a) && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">falta</span>}
                      <span className="ml-2 text-xs text-muted">{a.profissionais.map((p) => p.nome).join(" + ")}</span>
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {a.recebido > 0 ? `falta ${moeda.format(saldo(a))}` : moeda.format(saldo(a))}
                    </span>
                    {marcado && (
                      <input
                        value={marcados.get(a.id)}
                        onChange={(e) => setMarcados((m) => new Map(m).set(a.id, e.target.value))}
                        inputMode="decimal"
                        aria-label={`Valor quitado em ${dataCurta(a.data)}`}
                        className={`${entrada} w-24 py-1 text-right`}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Valor recebido</span>
          <input value={valor} onChange={(e) => setValorDigitado(e.target.value)} inputMode="decimal" placeholder="0,00" className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Data</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Forma</span>
          <select value={forma} onChange={(e) => setForma(e.target.value as Forma)} className={entrada}>
            {FORMAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Observação</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={entrada} />
        </label>
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
          {salvando ? "Salvando…" : "Salvar pagamento"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-full bg-black/[0.04] px-4 py-2 text-sm font-medium hover:bg-black/[0.07]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function EscolherPaciente({
  escolhido,
  aoEscolher,
}: {
  escolhido: { id: string; nome: string } | null;
  aoEscolher: (p: { id: string; nome: string } | null) => void;
}) {
  const [pacientes, setPacientes] = useState<{ id: string; nome: string }[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (escolhido || pacientes) return;
    pacientesParaPagamento()
      .then(setPacientes)
      .catch(() => setPacientes([]));
  }, [escolhido, pacientes]);

  if (escolhido) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">Paciente:</span>
        <span className="font-medium">{escolhido.nome}</span>
        <button type="button" onClick={() => aoEscolher(null)} className="text-xs text-accent hover:underline">
          trocar
        </button>
      </div>
    );
  }

  const termo = paraBusca(busca);
  const encontrados = termo ? (pacientes ?? []).filter((p) => paraBusca(p.nome).includes(termo)).slice(0, 8) : [];
  return (
    <div className="flex flex-col gap-1 text-sm">
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Pesquisar paciente"
        aria-label="Pesquisar paciente"
        autoFocus
        className={`${entrada} max-w-sm`}
      />
      {encontrados.length > 0 && (
        <ul role="listbox" aria-label="Pacientes" className="max-w-sm overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-black/10">
          {encontrados.map((p) => (
            <li
              key={p.id}
              role="option"
              aria-selected={false}
              onClick={() => aoEscolher(p)}
              className="cursor-pointer px-3 py-1.5 hover:bg-background"
            >
              {p.nome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
