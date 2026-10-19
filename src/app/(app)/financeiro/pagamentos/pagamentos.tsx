"use client";

// Pagamentos recebidos: os registrados no mês e os atendimentos ainda não pagos
// (por paciente), com o registro de um pagamento que quita atendimentos; as
// baixas (glosa, desconto) do mês e as quitações a revisar.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MOTIVOS_DE_BAIXA,
  agrupar,
  ehFalta,
  ehRealizado,
  rotuloDaForma,
  saldo,
  type AtendimentoFinanceiro,
  type PagamentoFinanceiro,
} from "@/lib/financeiro/calculos";
import type { BaixaDoMes, QuitacaoARevisar } from "@/lib/financeiro/dados";
import { dataCurta, moeda } from "../comum";
import { desvincularQuitacao, excluirBaixa, excluirPagamento } from "../actions";
import { RegistrarPagamento, type Origem } from "./registrar-pagamento";

export type Aba = "registrados" | "nao-pagos" | "baixas" | "revisar";

export function Pagamentos({
  aba,
  pagamentos,
  atendimentos,
  baixas,
  revisar,
  planos,
  hoje,
  mes,
}: {
  aba: Aba;
  pagamentos: PagamentoFinanceiro[];
  atendimentos: AtendimentoFinanceiro[];
  baixas: BaixaDoMes[];
  revisar: QuitacaoARevisar[];
  planos: { id: string; nome: string }[];
  hoje: string;
  mes: string;
}) {
  const [registrando, setRegistrando] = useState<Origem | null>(null);
  const [comFaltas, setComFaltas] = useState(false);

  const emAberto = atendimentos.filter((a) => (ehRealizado(a) || (comFaltas && ehFalta(a))) && saldo(a) > 0);
  const porPaciente = agrupar(emAberto, "paciente");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Seções" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
          {(
            [
              ["registrados", "Registrados", `/financeiro/pagamentos?mes=${mes}`],
              ["nao-pagos", "Não pagos", `/financeiro/pagamentos?mes=${mes}&aba=nao-pagos`],
              ["baixas", "Baixas", `/financeiro/pagamentos?mes=${mes}&aba=baixas`],
              ["revisar", revisar.length ? `A revisar (${revisar.length})` : "A revisar", `/financeiro/pagamentos?mes=${mes}&aba=revisar`],
            ] as const
          ).map(([v, rotulo, href]) => (
            <Link
              key={v}
              href={href}
              aria-current={aba === v ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 ${aba === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() =>
            setRegistrando({
              tipo: "paciente",
              id: null,
              nome: "",
              marcarTodos: false,
            })
          }
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Registrar pagamento
        </button>
      </div>

      {registrando && (
        <RegistrarPagamento
          key={JSON.stringify(registrando)}
          origem={registrando}
          planos={planos}
          hoje={hoje}
          aoFechar={() => setRegistrando(null)}
        />
      )}

      {aba === "registrados" ? (
        <ListaDePagamentos pagamentos={pagamentos} />
      ) : aba === "baixas" ? (
        <ListaDeBaixas baixas={baixas} />
      ) : aba === "revisar" ? (
        <ARevisar itens={revisar} />
      ) : (
        <section aria-label="Atendimentos não pagos" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
            <span>
              <strong className="tabular-nums">{moeda.format(emAberto.reduce((t, a) => t + saldo(a), 0))}</strong>
              <span className="text-muted">
                {" "}
                em {emAberto.length} atendimento
                {emAberto.length === 1 ? "" : "s"} {comFaltas ? "realizados e faltas" : "realizados"} do mês
              </span>
            </span>
            <Link
              href={`/financeiro/atendimentos?mes=${mes}&periodo=aberto&status=atendido&agrupar=paciente`}
              className="text-accent hover:underline"
            >
              Em aberto de todos os meses →
            </Link>
            <label className="flex cursor-pointer items-center gap-2 text-muted">
              <input type="checkbox" checked={comFaltas} onChange={(e) => setComFaltas(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Incluir faltas
            </label>
          </div>
          {porPaciente.length === 0 ? (
            <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhum atendimento em aberto.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
              {porPaciente.map((g) => (
                <li key={g.chave} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-paciente={g.rotulo}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.rotulo}</span>
                    <span className="block truncate text-xs text-muted">
                      {g.itens.map((a) => `${dataCurta(a.data)}${ehFalta(a) ? " (falta)" : ""}`).join(", ")}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{moeda.format(g.itens.reduce((t, a) => t + saldo(a), 0))}</span>
                  {g.chave && (
                    <button
                      type="button"
                      onClick={() =>
                        setRegistrando({
                          tipo: "paciente",
                          id: g.chave,
                          nome: g.rotulo,
                          marcarTodos: true,
                        })
                      }
                      className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-medium hover:bg-black/[0.07]"
                    >
                      Registrar pagamento
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function ListaDePagamentos({ pagamentos }: { pagamentos: PagamentoFinanceiro[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  async function excluir(p: PagamentoFinanceiro) {
    if (!confirm(`Excluir o pagamento de ${moeda.format(p.valor)}? Os atendimentos que ele quitava voltam a ficar em aberto.`)) return;
    const r = await excluirPagamento(p.id).catch(() => ({
      ok: false as const,
      erro: "Falha de conexão.",
    }));
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  if (pagamentos.length === 0)
    return <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhum pagamento registrado no mês.</p>;
  return (
    <>
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      <ul aria-label="Pagamentos registrados" className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
        {pagamentos.map((p) => {
          const livre = Math.round((p.valor - p.vinculado) * 100) / 100;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="w-12 shrink-0 text-muted tabular-nums">{dataCurta(p.data)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.paciente?.nome ?? p.plano?.nome ?? "Sem origem"}</span>
                <span className="block truncate text-xs text-muted">
                  {[
                    rotuloDaForma(p.forma),
                    p.atendimentos ? `quita ${p.atendimentos} atendimento${p.atendimentos === 1 ? "" : "s"}` : "sem atendimentos",
                    livre > 0 && p.atendimentos ? `${moeda.format(livre)} sem vínculo` : null,
                    p.observacao,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="font-medium tabular-nums">{moeda.format(p.valor)}</span>
              <button
                type="button"
                onClick={() => void excluir(p)}
                aria-label={`Excluir pagamento de ${moeda.format(p.valor)}`}
                className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-danger"
              >
                Excluir
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function useExecutar() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  async function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    const r = await acao().catch(() => ({
      ok: false as const,
      erro: "Falha de conexão.",
    }));
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }
  const alerta = erro && (
    <p role="alert" className="text-sm text-danger">
      {erro}
    </p>
  );
  return { executar, alerta };
}

function ListaDeBaixas({ baixas }: { baixas: BaixaDoMes[] }) {
  const { executar, alerta } = useExecutar();
  if (baixas.length === 0)
    return (
      <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">
        Nenhuma baixa no mês. Para dar baixa, selecione os atendimentos na lista.
      </p>
    );
  return (
    <>
      {alerta}
      <ul aria-label="Baixas do mês" className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
        {baixas.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="w-12 shrink-0 text-muted tabular-nums">{dataCurta(b.data)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{b.paciente ?? "—"}</span>
              <span className="block truncate text-xs text-muted">
                {[
                  MOTIVOS_DE_BAIXA.find((m) => m.valor === b.motivo)?.rotulo,
                  `atendimento de ${dataCurta(b.dataDoAtendimento)}`,
                  b.plano,
                  b.observacao,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="font-medium tabular-nums">{moeda.format(b.valor)}</span>
            <button
              type="button"
              onClick={() =>
                confirm(`Desfazer a baixa de ${moeda.format(b.valor)}? O valor volta a ficar em aberto.`) && void executar(() => excluirBaixa(b.id))
              }
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-background hover:text-danger"
            >
              Desfazer
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const MOTIVO_DA_REVISAO: Record<QuitacaoARevisar["motivo"], string> = {
  excluido: "O atendimento foi excluído",
  status: "O atendimento não está mais como realizado ou falta",
  valor: "O atendimento recebeu mais do que vale",
};

function ARevisar({ itens }: { itens: QuitacaoARevisar[] }) {
  const { executar, alerta } = useExecutar();
  if (itens.length === 0) return <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nada a revisar.</p>;
  return (
    <>
      <p className="px-1 text-sm text-muted">
        Pagamentos ligados a atendimentos que mudaram depois de pagos. Corrija o atendimento na agenda, ou desvincule: o valor continua no pagamento,
        como crédito sem vínculo.
      </p>
      {alerta}
      <ul aria-label="Pagamentos a revisar" className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
        {itens.map((q) => (
          <li
            key={`${q.pagamentoId}-${q.atendimentoId}`}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            data-revisar={q.atendimento.paciente ?? ""}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {q.atendimento.paciente ?? "—"} · atendimento de {dataCurta(q.atendimento.data)}
              </span>
              <span className="block truncate text-xs text-muted">
                {MOTIVO_DA_REVISAO[q.motivo]}
                {q.pagamento && ` · pagamento de ${dataCurta(q.pagamento.data)} (${moeda.format(q.pagamento.valor)})`}
              </span>
            </span>
            <span className="font-medium tabular-nums">{moeda.format(q.valor)}</span>
            <button
              type="button"
              onClick={() => void executar(() => desvincularQuitacao(q.pagamentoId, q.atendimentoId))}
              className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-medium hover:bg-black/[0.07]"
            >
              Desvincular
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
