import Link from "next/link";
import { hoje } from "@/lib/agenda/tempo";
import { mesDaUrl } from "@/lib/financeiro/calculos";
import { carregarAtendimentosDoMes, carregarPendentes, carregarPlanos } from "@/lib/financeiro/dados";
import { filtrosDaUrl } from "@/lib/financeiro/filtros";
import { CabecalhoDoFinanceiro, mesNaUrl } from "../comum";
import { ListaFinanceira } from "./lista-financeira";

// ?periodo=aberto: realizados e faltas com saldo em aberto de todos os meses
// (ex.: o convênio paga vários meses de uma vez).
export default async function AtendimentosFinanceiroPage({ searchParams }: PageProps<"/financeiro/atendimentos">) {
  const params = await searchParams;
  const mes = mesDaUrl(params.mes);
  const emAberto = params.periodo === "aberto";
  const [atendimentos, planos] = await Promise.all([emAberto ? carregarPendentes() : carregarAtendimentosDoMes(mes), carregarPlanos()]);
  const filtros = filtrosDaUrl(params);
  // Ao trocar de mês ou de período, a tela abre com os filtros com que foi aberta.
  const extras = ["status", "pagamento", "agrupar", "plano"]
    .map((k) => (typeof params[k] === "string" ? `&${k}=${encodeURIComponent(params[k] as string)}` : ""))
    .join("");
  const base = `/financeiro/atendimentos?mes=${mesNaUrl(mes)}${extras}`;

  return (
    <>
      <CabecalhoDoFinanceiro
        titulo={emAberto ? "Em aberto de todos os meses" : "Atendimentos"}
        mes={mes}
        caminho="/financeiro/atendimentos"
        extras={extras}
        comMes={!emAberto}
      >
        <nav aria-label="Período" className="flex gap-0.5 rounded-full bg-black/[0.04] p-1 text-sm">
          {(
            [
              [false, "Mês", base],
              [true, "Em aberto (todos os meses)", `${base}&periodo=aberto`],
            ] as const
          ).map(([v, rotulo, href]) => (
            <Link
              key={rotulo}
              href={href}
              aria-current={emAberto === v ? "page" : undefined}
              className={`rounded-full px-3 py-1 ${emAberto === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {rotulo}
            </Link>
          ))}
        </nav>
      </CabecalhoDoFinanceiro>
      <ListaFinanceira key={`${mes}${extras}${emAberto}`} atendimentos={atendimentos} planos={planos} inicial={filtros} hoje={hoje()} />
    </>
  );
}
