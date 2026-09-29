// Divergências entre a agenda importada do sistema anterior e a marcada no app,
// por coluna (profissional num dia). Desmarcados não contam.
//   - sobreposição: um importado e um do app ocupam o profissional ao mesmo tempo;
//   - horário: o mesmo paciente, com o mesmo profissional no mesmo dia, em horários
//     diferentes (provavelmente a mesma sessão lançada nos dois sistemas).

import type { AtendimentoAgenda } from "./dados";
import { formatarHora } from "./tempo";

export type Divergencia = {
  /** "dia|profissional" (a coluna da agenda). */
  coluna: string;
  /** O importado e o do app. */
  importado: string;
  doApp: string;
  tipo: "sobreposicao" | "horario";
};

export function encontrarDivergencias(atendimentos: AtendimentoAgenda[]): Divergencia[] {
  const porColuna = new Map<string, AtendimentoAgenda[]>();
  for (const a of atendimentos) {
    if (a.status === "desmarcado") continue;
    for (const p of a.profissionalIds) {
      const k = `${a.data}|${p}`;
      porColuna.set(k, [...(porColuna.get(k) ?? []), a]);
    }
  }

  const r: Divergencia[] = [];
  for (const [coluna, lista] of porColuna) {
    const importados = lista.filter((a) => a.importado);
    const doApp = lista.filter((a) => !a.importado);
    for (const i of importados)
      for (const a of doApp) {
        if (i.inicio < a.fim && a.inicio < i.fim) r.push({ coluna, importado: i.id, doApp: a.id, tipo: "sobreposicao" });
        else if (i.pacienteId && i.pacienteId === a.pacienteId) r.push({ coluna, importado: i.id, doApp: a.id, tipo: "horario" });
      }
  }
  return r;
}

/** Texto de cada atendimento envolvido (para o card), por id. */
export function textosDasDivergencias(divergencias: Divergencia[], porId: Map<string, AtendimentoAgenda>): Map<string, string> {
  const textos = new Map<string, string[]>();
  const add = (id: string, t: string) => textos.set(id, [...(textos.get(id) ?? []), t]);
  for (const d of divergencias) {
    const i = porId.get(d.importado);
    const a = porId.get(d.doApp);
    if (!i || !a) continue;
    if (d.tipo === "sobreposicao") {
      add(d.importado, `mesmo horário que ${a.paciente ?? "atendimento"} (marcado no app)`);
      add(d.doApp, `mesmo horário que ${i.paciente ?? "atendimento"} (importado)`);
    } else {
      add(d.importado, `no app, este paciente está às ${formatarHora(a.inicio)}`);
      add(d.doApp, `no sistema anterior, este paciente está às ${formatarHora(i.inicio)}`);
    }
  }
  return new Map([...textos].map(([id, t]) => [id, `Divergência: ${t.join("; ")}`]));
}
