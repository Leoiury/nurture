import { describe, expect, it } from "vitest";
import { escalaDasJornadas, escalaDoDia, intersecao, problemaNoDia, subtrair, unir } from "./escala";
import { formatarDuracao, mapearDia, mapearPeriodo } from "./ocupacao";

const h = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const i = (de: string, ate: string) => ({ inicio: h(de), fim: h(ate) });

describe("intervalos", () => {
  it("unir junta sobrepostos e encostados", () => {
    expect(unir([i("09:00", "10:00"), i("08:00", "09:00"), i("09:30", "11:00")])).toEqual([i("08:00", "11:00")]);
  });
  it("interseção e subtração", () => {
    expect(intersecao([i("08:00", "12:00"), i("13:00", "18:00")], [i("10:00", "15:00")])).toEqual([i("10:00", "12:00"), i("13:00", "15:00")]);
    expect(subtrair([i("08:00", "12:00")], [i("09:00", "10:00"), i("11:30", "13:00")])).toEqual([i("08:00", "09:00"), i("10:00", "11:30")]);
  });
  it("problemas na escala do dia", () => {
    expect(problemaNoDia([i("08:00", "12:00"), i("13:00", "18:00")])).toBeNull();
    expect(problemaNoDia([i("12:00", "08:00")])).toMatch(/depois do início/);
    expect(problemaNoDia([i("08:00", "12:00"), i("11:00", "14:00")])).toMatch(/sobrepostos/);
  });
});

describe("escala", () => {
  const estagiaria = escalaDasJornadas([
    { dia_semana: 1, hora_inicio: "13:00:00", hora_fim: "18:00:00" },
    { dia_semana: 3, hora_inicio: "13:00:00", hora_fim: "18:00:00" },
  ]);

  it("dias fora da escala não têm expediente", () => {
    expect(escalaDoDia(estagiaria, "2026-10-05", undefined)).toEqual([i("13:00", "18:00")]); // segunda
    expect(escalaDoDia(estagiaria, "2026-10-06", undefined)).toEqual([]); // terça
  });
  it("sem escala: expediente padrão em dia útil; feriado zera", () => {
    expect(escalaDoDia(null, "2026-10-06", undefined)).toEqual([i("08:00", "12:00"), i("13:00", "18:00")]);
    expect(escalaDoDia(null, "2026-10-10", undefined)).toEqual([]); // sábado
    expect(escalaDoDia(null, "2026-10-12", [{ data: "2026-10-12", nome: "Nossa Senhora Aparecida", tipo: "feriado", origem: "nacional" }])).toEqual([]);
  });
});

describe("mapearDia", () => {
  const escala = [i("08:00", "12:00"), i("13:00", "18:00")];

  it("A, B, C e D de um dia", () => {
    const m = mapearDia("2026-10-05", escala, [
      i("08:15", "09:00"), // sobra 08:00–08:15 (15 min: não otimizado)
      i("09:00", "09:45"),
      i("10:00", "10:45"), // 09:45–10:00 (15 min: não otimizado)
      i("13:00", "13:45"),
      i("18:00", "18:30"), // fora da escala
    ]);
    expect(m.escala).toBe(540);
    expect(m.ocupado).toBe(210);
    expect(m.foraDaEscala).toBe(30);
    expect(m.livre).toBe(540 - 180);
    expect(m.naoOtimizado).toBe(30); // os dois de 15 min: juntos, uma sessão de 30
    expect(m.desperdicios).toBe(2);
    expect(m.intervalosDesperdicados).toEqual([i("08:00", "08:15"), i("09:45", "10:00")]);
  });

  it("limites exclusivos: 5 e 30 min não contam", () => {
    const m = mapearDia("2026-10-05", [i("08:00", "10:00")], [i("08:05", "09:00"), i("09:30", "10:00")]);
    expect(m.livres).toEqual([i("08:00", "08:05"), i("09:00", "09:30")]);
    expect(m.naoOtimizado).toBe(0);
  });

  it("atendimentos simultâneos contam uma vez", () => {
    expect(mapearDia("2026-10-05", escala, [i("09:00", "10:00"), i("09:30", "10:00")]).ocupado).toBe(60);
  });
});

describe("mapearPeriodo", () => {
  it("soma os dias", () => {
    const p = mapearPeriodo(
      ["2026-10-05", "2026-10-06"],
      () => [i("08:00", "09:00")],
      (d) => (d === "2026-10-05" ? [i("08:10", "09:00")] : []),
    );
    expect(p.total).toEqual({ escala: 120, ocupado: 50, foraDaEscala: 0, livre: 70, naoOtimizado: 10, desperdicios: 1 });
  });
});

describe("formatarDuracao", () => {
  it("horas e minutos", () => {
    expect([formatarDuracao(150), formatarDuracao(45), formatarDuracao(120)]).toEqual(["2h30", "45 min", "2h"]);
  });
});
