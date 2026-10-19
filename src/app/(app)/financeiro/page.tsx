import Link from "next/link";
import { mesDaUrl, resumoDoMes } from "@/lib/financeiro/calculos";
import {
  carregarAtendimentosDoMes,
  carregarDespesasDoMes,
  carregarPagamentosDoMes,
  carregarQuitacoesARevisar,
  carregarTotalEmAberto,
} from "@/lib/financeiro/dados";
import { CabecalhoDoFinanceiro, Seta, mesNaUrl, moeda } from "./comum";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default async function FinanceiroPage({ searchParams }: PageProps<"/financeiro">) {
  const mes = mesDaUrl((await searchParams).mes);
  const [atendimentos, pagamentos, despesas, emAberto, aRevisar] = await Promise.all([
    carregarAtendimentosDoMes(mes),
    carregarPagamentosDoMes(mes),
    carregarDespesasDoMes(mes),
    carregarTotalEmAberto(),
    carregarQuitacoesARevisar(),
  ]);
  const r = resumoDoMes(atendimentos, pagamentos, despesas);
  const m = `mes=${mesNaUrl(mes)}`;
  const porcentagem = (parte: number, todo: number) => (todo > 0 ? Math.min(100, Math.round((parte / todo) * 100)) : 0);

  return (
    <>
      <CabecalhoDoFinanceiro titulo="Financeiro" mes={mes} caminho="/financeiro" voltar={false} />

      {aRevisar.length > 0 && (
        <Link
          href={`/financeiro/pagamentos?${m}&aba=revisar`}
          role="alert"
          className="group flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:brightness-[0.98]"
        >
          <span>
            {plural(aRevisar.length, "pagamento quita", "pagamentos quitam")} atendimento{aRevisar.length === 1 ? "" : "s"} que{" "}
            {aRevisar.length === 1 ? "foi excluído, desmarcado ou mudou de valor" : "foram excluídos, desmarcados ou mudaram de valor"}. Revisar
          </span>
          <Seta />
        </Link>
      )}

      {/* Card principal: cada valor tem sua própria interação. */}
      <section
        aria-label="Resumo do mês"
        className="grid overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-black/5 md:grid-cols-3 md:divide-x md:divide-border"
      >
        <div className="flex flex-col gap-1 p-5" data-card="esperado">
          <span className="text-sm text-muted">Esperado no mês</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{moeda.format(r.esperado.valor)}</span>
          <span className="text-xs text-muted">
            {plural(r.esperado.quantidade, "atendimento", "atendimentos")} (sem os desmarcados)
            {r.esperado.semValor > 0 && (
              <>
                {" · "}
                <Link href={`/financeiro/atendimentos?${m}&pagamento=sem_valor`} className="text-danger underline-offset-2 hover:underline">
                  {r.esperado.semValor} sem valor
                </Link>
              </>
            )}
          </span>
        </div>
        <Link
          href={`/financeiro/atendimentos?${m}&status=atendido`}
          className="group flex flex-col gap-1 border-t border-border p-5 hover:bg-background md:border-t-0"
          data-card="realizados"
        >
          <span className="flex items-center justify-between text-sm text-muted">
            Realizados
            <Seta />
          </span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{moeda.format(r.realizados.valor)}</span>
          <Barra valor={porcentagem(r.realizados.valor, r.esperado.valor)} rotulo="do esperado" />
          <span className="text-xs text-muted">{plural(r.realizados.quantidade, "atendimento realizado", "atendimentos realizados")}</span>
        </Link>
        <Link
          href={`/financeiro/extrato?${m}`}
          className="group flex flex-col gap-1 border-t border-border p-5 hover:bg-background md:border-t-0"
          data-card="recebido"
        >
          <span className="flex items-center justify-between text-sm text-muted">
            Recebido (entrou no caixa)
            <Seta />
          </span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{moeda.format(r.recebido.valor)}</span>
          <span className="text-xs text-muted">{plural(r.recebido.quantidade, "pagamento registrado", "pagamentos registrados")} no mês</span>
          <Barra valor={porcentagem(r.recebidoDosRealizados, r.realizados.valor)} rotulo="dos realizados quitados" />
          <span className="text-xs text-muted" title="O que já foi pago dos atendimentos realizados neste mês, em qualquer data">
            {moeda.format(r.recebidoDosRealizados)} dos realizados do mês
          </span>
        </Link>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          titulo="Faltas"
          href={`/financeiro/atendimentos?${m}&status=faltou`}
          valor={r.faltas.valor}
          rodape={plural(r.faltas.quantidade, "falta", "faltas")}
          dado="faltas"
        />
        <Card
          titulo="Não pagos"
          href={`/financeiro/pagamentos?${m}&aba=nao-pagos`}
          valor={r.naoPagos.valor}
          rodape={`${plural(r.naoPagos.quantidade, "atendimento realizado", "atendimentos realizados")} do mês em aberto`}
          dado="nao-pagos"
        >
          {r.baixas.valor > 0 && <span className="text-xs text-muted">Baixas (glosa, desconto): {moeda.format(r.baixas.valor)}</span>}
          <span className="mt-auto border-t border-border pt-2 text-xs">
            Em aberto em todos os meses: <strong className="tabular-nums">{moeda.format(emAberto.valor)}</strong>
            <span className="text-muted"> ({emAberto.quantidade})</span>
          </span>
        </Card>
        <Card
          titulo="A receber por plano"
          href={`/financeiro/atendimentos?${m}&status=atendido&pagamento=aberto&agrupar=plano`}
          valor={r.naoPagos.valor}
          dado="a-receber"
        >
          {r.aReceberPorPlano.length === 0 ? (
            <span className="text-xs text-muted">Nada a receber.</span>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {r.aReceberPorPlano.slice(0, 4).map((p) => (
                <li key={p.plano} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: p.cor ?? "var(--border)" }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.plano}</span>
                  <span className="tabular-nums text-muted">{moeda.format(p.valor)}</span>
                </li>
              ))}
              {r.aReceberPorPlano.length > 4 && <li className="text-muted">+ {r.aReceberPorPlano.length - 4} planos</li>}
            </ul>
          )}
        </Card>
        <Card
          titulo="Despesas"
          href={`/financeiro/despesas?${m}`}
          valor={r.despesas.valor}
          rodape={
            r.despesas.quantidade === 0
              ? "Nenhuma despesa lançada"
              : `${moeda.format(r.despesas.pagas)} pagas · ${moeda.format(r.despesas.emAberto)} em aberto`
          }
          dado="despesas"
        />
      </div>
    </>
  );
}

function Barra({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${valor}%` }} />
      </span>
      <span className="tabular-nums">
        {valor}% {rotulo}
      </span>
    </span>
  );
}

function Card({
  titulo,
  href,
  valor,
  rodape,
  dado,
  children,
}: {
  titulo: string;
  href: string;
  valor: number;
  rodape?: string;
  dado: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-card={dado}
      className="group flex flex-col gap-2 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5 transition hover:ring-black/15"
    >
      <span className="flex items-center justify-between text-sm text-muted">
        {titulo}
        <Seta />
      </span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{moeda.format(valor)}</span>
      {rodape && <span className="text-xs text-muted">{rodape}</span>}
      {children}
    </Link>
  );
}
