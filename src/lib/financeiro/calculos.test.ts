import { describe, expect, it } from "vitest";
import {
  agrupar,
  extrato,
  mesDaUrl,
  ordenar,
  resumoDoMes,
  saldo,
  situacaoDePagamento,
  type AtendimentoFinanceiro,
  type DespesaFinanceira,
  type PagamentoFinanceiro,
} from "./calculos";

const unimed = { id: "u", nome: "Unimed", cor: "#00f" };
const particular = { id: "p", nome: "Particular", cor: "#f00" };

function at(parcial: Partial<AtendimentoFinanceiro>): AtendimentoFinanceiro {
  return {
    id: Math.random().toString(36),
    inicio: "2026-10-06T12:00:00Z",
    data: "2026-10-06",
    status: "atendido",
    valor: 100,
    recebido: 0,
    baixado: 0,
    paciente: { id: "ana", nome: "Ana" },
    plano: unimed,
    tipo: null,
    profissionais: [],
    ...parcial,
  };
}

const pagamento = (data: string, valor: number): PagamentoFinanceiro => ({
  id: data + valor,
  data,
  valor,
  forma: "pix",
  observacao: null,
  paciente: { id: "ana", nome: "Ana" },
  plano: null,
  vinculado: valor,
  atendimentos: 1,
});

const despesa = (data: string, valor: number, pagaEm: string | null): DespesaFinanceira => ({
  id: data + valor,
  data,
  descricao: "Aluguel",
  categoria: "Aluguel",
  valor,
  pagaEm,
  observacao: null,
  recorrente: false,
});

describe("situação de pagamento", () => {
  it("pago, parcial, não pago e sem valor", () => {
    expect(situacaoDePagamento({ valor: 100, recebido: 100, baixado: 0 })).toBe("pago");
    expect(situacaoDePagamento({ valor: 100, recebido: 40, baixado: 0 })).toBe("parcial");
    expect(situacaoDePagamento({ valor: 100, recebido: 0, baixado: 0 })).toBe("nao_pago");
    expect(situacaoDePagamento({ valor: null, recebido: 0, baixado: 0 })).toBe("sem_valor");
    expect(saldo({ valor: 100, recebido: 40, baixado: 0 })).toBe(60);
    expect(saldo({ valor: 100, recebido: 150, baixado: 0 })).toBe(0);
  });

  it("baixa (glosa) encerra o saldo", () => {
    expect(situacaoDePagamento({ valor: 120, recebido: 100, baixado: 20 })).toBe("baixado");
    expect(situacaoDePagamento({ valor: 120, recebido: 0, baixado: 20 })).toBe("parcial");
    expect(saldo({ valor: 120, recebido: 50, baixado: 20 })).toBe(50);
  });
});

describe("resumo do mês", () => {
  it("esperado ignora desmarcados; realizados só atendidos; faltas à parte", () => {
    const r = resumoDoMes(
      [
        at({ status: "atendido", valor: 100, recebido: 100 }),
        at({ status: "atendido", valor: 80, recebido: 30, plano: particular }),
        at({ status: "atendido", valor: 50 }),
        at({ status: "atendido", valor: 60, recebido: 40, baixado: 20 }),
        at({ status: "faltou", valor: 100 }),
        at({ status: "marcado", valor: null }),
        at({ status: "desmarcado", valor: 999 }),
      ],
      [pagamento("2026-10-02", 130)],
      [despesa("2026-10-05", 1000, "2026-10-05"), despesa("2026-10-10", 200, null)],
    );
    expect(r.esperado).toEqual({ valor: 390, quantidade: 6, semValor: 1 });
    expect(r.realizados).toEqual({ valor: 290, quantidade: 4 });
    expect(r.recebidoDosRealizados).toBe(170);
    expect(r.baixas).toEqual({ valor: 20, quantidade: 1 });
    expect(r.faltas).toEqual({ valor: 100, quantidade: 1 });
    expect(r.recebido.valor).toBe(130);
    expect(r.naoPagos).toEqual({ valor: 100, quantidade: 2 });
    expect(r.aReceberPorPlano).toEqual([
      { plano: "Particular", cor: "#f00", valor: 50, quantidade: 1 },
      { plano: "Unimed", cor: "#00f", valor: 50, quantidade: 1 },
    ]);
    expect(r.despesas).toEqual({
      valor: 1200,
      quantidade: 2,
      pagas: 1000,
      emAberto: 200,
    });
  });
});

describe("agrupar e ordenar", () => {
  it("agrupa por profissional repetindo o atendimento conjunto", () => {
    const g = agrupar(
      [
        at({
          profissionais: [
            { id: "a", nome: "Bia" },
            { id: "b", nome: "Caio" },
          ],
        }),
      ],
      "profissional",
    );
    expect(g.map((x) => x.rotulo)).toEqual(["Bia", "Caio"]);
  });

  it("ordena por saldo e por paciente", () => {
    const lista = [at({ valor: 100, recebido: 90, paciente: { id: "1", nome: "Zé" } }), at({ valor: 100, paciente: { id: "2", nome: "Álvaro" } })];
    expect(ordenar(lista, "saldo", false).map((a) => a.paciente!.nome)).toEqual(["Álvaro", "Zé"]);
    expect(ordenar(lista, "paciente", true).map((a) => a.paciente!.nome)).toEqual(["Álvaro", "Zé"]);
  });
});

describe("extrato", () => {
  it("entradas e saídas em ordem, com saldo acumulado", () => {
    const linhas = extrato([pagamento("2026-10-05", 300)], [despesa("2026-10-01", 1000, "2026-10-05")]);
    expect(linhas.map((l) => [l.tipo, l.valor, l.acumulado])).toEqual([
      ["entrada", 300, 300],
      ["saida", -1000, -700],
    ]);
  });
});

describe("mês da URL", () => {
  it("aceita AAAA-MM e cai no mês atual se inválido", () => {
    expect(mesDaUrl("2026-03")).toBe("2026-03-01");
    expect(mesDaUrl("2026-13")).toMatch(/^\d{4}-\d{2}-01$/);
    expect(mesDaUrl(undefined)).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
