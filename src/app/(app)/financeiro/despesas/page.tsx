import { hoje } from "@/lib/agenda/tempo";
import { CATEGORIAS_SUGERIDAS, mesDaUrl } from "@/lib/financeiro/calculos";
import { carregarCategorias, carregarDespesasDoMes, carregarRecorrentes } from "@/lib/financeiro/dados";
import { CabecalhoDoFinanceiro } from "../comum";
import { Despesas } from "./despesas";

export default async function DespesasPage({ searchParams }: PageProps<"/financeiro/despesas">) {
  const mes = mesDaUrl((await searchParams).mes);
  const [despesas, usadas, recorrentes] = await Promise.all([
    carregarDespesasDoMes(mes),
    carregarCategorias(),
    carregarRecorrentes(`${hoje().slice(0, 7)}-01`),
  ]);
  const categorias = [...new Set([...CATEGORIAS_SUGERIDAS, ...usadas])];
  // Nova despesa: hoje, se estiver no mês exibido; senão, o dia 1 do mês.
  const dataPadrao = hoje().slice(0, 7) === mes.slice(0, 7) ? hoje() : mes;

  return (
    <>
      <CabecalhoDoFinanceiro titulo="Despesas" mes={mes} caminho="/financeiro/despesas" />
      <Despesas key={mes} despesas={despesas} recorrentes={recorrentes} categorias={categorias} dataPadrao={dataPadrao} hoje={hoje()} />
    </>
  );
}
