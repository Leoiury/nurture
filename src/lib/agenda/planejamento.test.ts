import { describe, expect, it } from "vitest";
import type { AtendimentoAgenda } from "./dados";
import { esperadoDe, lerErroDeAplicacao, moverNovo, semAlteracoesDe, semNovo, simular, type Operacao } from "./planejamento";
import { instanteNoFuso } from "./tempo";

const nomes = new Map([
  ["ana", "Ana Costa"],
  ["bia", "Bia Lima"],
]);

function atendimento(id: string, data: string, inicio: string, extra: Partial<AtendimentoAgenda> = {}): AtendimentoAgenda {
  const m = Number(inicio.slice(0, 2)) * 60 + Number(inicio.slice(3));
  return {
    id,
    profissionalIds: ["ana"],
    profissionalNomes: ["Ana Costa"],
    data,
    inicio: m,
    fim: m + 45,
    status: "marcado",
    paciente: `Paciente ${id}`,
    plano: null,
    tipo: null,
    recorrenciaId: null,
    ...extra,
  };
}

const exibicao = { paciente: "Novo Paciente", plano: null, tipo: null };

describe("simular", () => {
  const base = [
    atendimento("a", "2026-10-06", "09:00"),
    atendimento("s1", "2026-10-06", "14:00", { recorrenciaId: "r" }),
    atendimento("s2", "2026-10-13", "14:00", { recorrenciaId: "r" }),
    atendimento("s3", "2026-10-20", "14:00", { recorrenciaId: "r", status: "atendido" }),
  ];

  it("sem operações, é a agenda real", () => {
    expect(simular(base, [], nomes)).toEqual(base);
  });

  it("mover troca horário e profissional e marca como alterado", () => {
    const op: Operacao = {
      chave: "k",
      descricao: "",
      tipo: "mover",
      args: { p_id: "a", p_inicio: instanteNoFuso("2026-10-08", "10:30"), p_de_profissional: "ana", p_para_profissional: "bia" },
      esperado: esperadoDe(base[0]),
    };
    const a = simular(base, [op], nomes).find((x) => x.id === "a")!;
    expect(a).toMatchObject({ data: "2026-10-08", inicio: 630, fim: 675, profissionalIds: ["bia"], profissionalNomes: ["Bia Lima"], rascunho: "alterado" });
    expect(base[0].data).toBe("2026-10-06"); // não altera a agenda real
  });

  it("editar 'este e os próximos' desloca a série como o banco", () => {
    const op: Operacao = {
      chave: "k",
      descricao: "",
      tipo: "editar",
      exibicao,
      esperado: esperadoDe(base[2]),
      args: { p_id: "s2", p_alcance: "seguintes", p_paciente_id: "p", p_profissionais: ["bia"], p_data: "2026-10-15", p_hora: "08:00", p_duracao_min: 30 },
    };
    const r = simular(base, [op], nomes);
    expect(r.find((x) => x.id === "s1")).toMatchObject({ data: "2026-10-06", inicio: 840 }); // anterior: igual
    expect(r.find((x) => x.id === "s2")).toMatchObject({ data: "2026-10-15", inicio: 480, fim: 510, profissionalIds: ["bia"] });
    expect(r.find((x) => x.id === "s3")).toMatchObject({ data: "2026-10-22", inicio: 480 });
  });

  it("desmarcar a série poupa atendidos; excluir tira da agenda", () => {
    const ops: Operacao[] = [
      { chave: "d", descricao: "", tipo: "desmarcar", esperado: esperadoDe(base[1]), args: { p_id: "s1", p_alcance: "todos", p_motivo: "férias" } },
      { chave: "e", descricao: "", tipo: "excluir", esperado: esperadoDe(base[0]), args: { p_id: "a", p_alcance: "este", p_motivo: "duplicado" } },
    ];
    const r = simular(base, ops, nomes);
    expect(r.map((x) => [x.id, x.status])).toEqual([
      ["s1", "desmarcado"],
      ["s2", "desmarcado"],
      ["s3", "atendido"],
    ]);
  });

  it("criar gera um card por data, marcado como novo", () => {
    const op: Operacao = {
      chave: "c",
      descricao: "",
      tipo: "criar",
      exibicao,
      args: {
        p_paciente_id: "p",
        p_profissionais: ["bia"],
        p_inicios: [instanteNoFuso("2026-10-07", "11:00"), instanteNoFuso("2026-10-14", "11:00")],
        p_duracao_min: 60,
        p_frequencia: "semanal",
      },
    };
    const novos = simular([], [op], nomes);
    expect(novos.map((x) => [x.id, x.data, x.inicio, x.fim, x.rascunho])).toEqual([
      ["novo:c:0", "2026-10-07", 660, 720, "novo"],
      ["novo:c:1", "2026-10-14", 660, 720, "novo"],
    ]);
    expect(novos[0].paciente).toBe("Novo Paciente");
  });
});

describe("edição do rascunho", () => {
  const criar: Operacao = {
    chave: "c",
    descricao: "Nova série: X",
    tipo: "criar",
    exibicao,
    args: {
      p_paciente_id: "p",
      p_profissionais: ["ana"],
      p_inicios: [instanteNoFuso("2026-10-07", "11:00"), instanteNoFuso("2026-10-14", "11:00")],
      p_duracao_min: 60,
      p_frequencia: "semanal",
    },
  };

  it("mover um novo na mesma coluna só muda a data dele", () => {
    const [op] = moverNovo([criar], "novo:c:1", instanteNoFuso("2026-10-15", "09:00"), "ana", "ana", "x");
    expect(op.tipo === "criar" && op.args.p_inicios).toEqual([criar.args.p_inicios[0], instanteNoFuso("2026-10-15", "09:00")]);
  });

  it("mover um novo de série para outra coluna o separa como avulso", () => {
    const ops = moverNovo([criar], "novo:c:1", instanteNoFuso("2026-10-15", "09:00"), "ana", "bia", "x");
    expect(ops).toHaveLength(2);
    const [serie, avulso] = ops;
    expect(serie.tipo === "criar" && serie.args.p_inicios).toEqual([criar.args.p_inicios[0]]);
    expect(avulso).toMatchObject({ chave: "x", descricao: "Novo: X" });
    expect(avulso.tipo === "criar" && [avulso.args.p_profissionais, avulso.args.p_frequencia]).toEqual([["bia"], undefined]);
  });

  it("remover um novo (ou a série) e as alterações de um atendimento", () => {
    expect(semNovo([criar], "novo:c:0", false)[0]).toMatchObject({ args: { p_inicios: [criar.args.p_inicios[1]] } });
    expect(semNovo([criar], "novo:c:0", true)).toEqual([]);
    const mover: Operacao = { chave: "m", descricao: "", tipo: "mover", args: { p_id: "a", p_inicio: "x" }, esperado: { inicio: "", fim: "", status: "marcado", profissionais: [] } };
    expect(semAlteracoesDe([criar, mover], "a")).toEqual([criar]);
  });
});

describe("lerErroDeAplicacao", () => {
  it("aponta a operação", () => {
    expect(lerErroDeAplicacao("CONFLITO k2")?.chave).toBe("k2");
    expect(lerErroDeAplicacao("ERRO k3: Duração inválida.")).toEqual({ chave: "k3", motivo: "Duração inválida." });
    expect(lerErroDeAplicacao("outra coisa")).toBeNull();
  });
});
