import { hoje } from "@/lib/agenda/tempo";
import { mesDaUrl } from "@/lib/financeiro/calculos";
import {
  carregarAtendimentosDoMes,
  carregarBaixasDoMes,
  carregarPagamentosDoMes,
  carregarPlanos,
  carregarQuitacoesARevisar,
} from "@/lib/financeiro/dados";
import { CabecalhoDoFinanceiro } from "../comum";
import { Pagamentos, type Aba } from "./pagamentos";

export default async function PagamentosPage({ searchParams }: PageProps<"/financeiro/pagamentos">) {
  const params = await searchParams;
  const mes = mesDaUrl(params.mes);
  const aba: Aba = (["nao-pagos", "baixas", "revisar"] as const).find((a) => a === params.aba) ?? "registrados";
  const [pagamentos, atendimentos, planos, baixas, revisar] = await Promise.all([
    carregarPagamentosDoMes(mes),
    carregarAtendimentosDoMes(mes),
    carregarPlanos(),
    carregarBaixasDoMes(mes),
    carregarQuitacoesARevisar(),
  ]);

  return (
    <>
      <CabecalhoDoFinanceiro
        titulo="Pagamentos recebidos"
        mes={mes}
        caminho="/financeiro/pagamentos"
        extras={aba === "registrados" ? "" : `&aba=${aba}`}
      />
      <Pagamentos
        key={mes}
        aba={aba}
        pagamentos={pagamentos}
        atendimentos={atendimentos}
        baixas={baixas}
        revisar={revisar}
        planos={planos}
        hoje={hoje()}
        mes={mes.slice(0, 7)}
      />
    </>
  );
}
