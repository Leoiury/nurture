import Link from "next/link";
import { extrato, mesDaUrl } from "@/lib/financeiro/calculos";
import { carregarDespesasPagasNoMes, carregarPagamentosDoMes } from "@/lib/financeiro/dados";
import { CabecalhoDoFinanceiro, dataCurta, mesNaUrl, moeda } from "../comum";

// Entradas (pagamentos recebidos) e saídas (despesas pagas) do mês, em ordem de data.
export default async function ExtratoPage({ searchParams }: PageProps<"/financeiro/extrato">) {
  const mes = mesDaUrl((await searchParams).mes);
  const [pagamentos, despesas] = await Promise.all([carregarPagamentosDoMes(mes), carregarDespesasPagasNoMes(mes)]);
  const linhas = extrato(pagamentos, despesas);
  const entradas = linhas.filter((l) => l.tipo === "entrada").reduce((t, l) => t + l.valor, 0);
  const saidas = linhas.filter((l) => l.tipo === "saida").reduce((t, l) => t - l.valor, 0);

  return (
    <>
      <CabecalhoDoFinanceiro titulo="Extrato" mes={mes} caminho="/financeiro/extrato">
        <Link
          href={`/financeiro/pagamentos?mes=${mesNaUrl(mes)}`}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Registrar pagamento
        </Link>
      </CabecalhoDoFinanceiro>

      <dl role="status" aria-label="Totais do extrato" className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["Entradas", entradas, "text-emerald-700"],
            ["Saídas", -saidas, "text-danger"],
            ["Saldo do mês", entradas - saidas, ""],
          ] as const
        ).map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-black/5">
            <dt className="text-sm text-muted">{rotulo}</dt>
            <dd className={`text-xl font-semibold tabular-nums ${cor}`}>{moeda.format(valor)}</dd>
          </div>
        ))}
      </dl>

      {linhas.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-black/5">Nenhuma movimentação no mês.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-black/5">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-background text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Data
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Descrição
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Valor
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((l) => (
                <tr key={`${l.tipo}-${l.id}`} data-tipo={l.tipo}>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dataCurta(l.data)}</td>
                  <td className="px-3 py-2">
                    <span className="block font-medium">{l.descricao}</span>
                    {l.detalhe && <span className="block text-xs text-muted">{l.detalhe}</span>}
                  </td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${l.tipo === "entrada" ? "text-emerald-700" : "text-danger"}`}>
                    {l.tipo === "entrada" ? "+" : "−"} {moeda.format(Math.abs(l.valor))}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-muted tabular-nums">{moeda.format(l.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
