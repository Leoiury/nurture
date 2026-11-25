import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { painelDetalhes } from "./ajudantes";

// Excluir sem depender da série: todos do paciente no mesmo dia da semana e horário, ou
// este e todos os próximos. Só de agora em diante e só com o mesmo profissional.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const n = Date.now();
const profissionais: string[] = [];

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
/** Quarta-feira daqui a `semanas` semanas (negativo: no passado). */
function quarta(semanas: number) {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dia = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  return somarDias(hoje, ((3 - dia + 7) % 7) + 7 * semanas);
}

test.afterAll(async () => {
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("excluir todos do paciente no mesmo horário, com a prévia das datas", async ({ page }) => {
  const [eu, colega] = await Promise.all(
    ["Eu", "Colega"].map(async (r) => (await admin.from("profissionais").insert({ nome: `Zeta Alcance ${r} ${n}` }).select("id").single()).data!.id as string),
  );
  profissionais.push(eu, colega);
  const { data: paciente } = await admin.from("pacientes").insert({ nome: `Paciente Alcance ${n}` }).select("id, nome").single();
  async function atendimento(data: string, hora: string, profissional = eu) {
    const inicio = new Date(`${data}T${hora}:00-03:00`);
    const { data: a } = await admin
      .from("atendimentos")
      .insert({ paciente_id: paciente!.id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() })
      .select("id")
      .single();
    await admin.from("atendimento_profissionais").insert({ atendimento_id: a!.id, profissional_id: profissional });
    return a!.id as string;
  }
  // Avulsos (sem série): quartas às 15:00, mais um em outro horário e um com o colega.
  const passado = await atendimento(quarta(-1), "15:00");
  const base = await atendimento(quarta(2), "15:00");
  const depois = await atendimento(quarta(3), "15:00");
  const outroHorario = await atendimento(quarta(3), "09:00");
  const doColega = await atendimento(quarta(4), "15:00", colega);

  await page.goto(`/agenda?dia=${quarta(2)}`);
  await page.locator(`button[data-atendimento="${base}"]`).click();
  const painel = painelDetalhes(page);
  await painel.getByRole("button", { name: "Excluir atendimento…" }).click();
  const radio = painel.getByRole("radio", { name: new RegExp(`^Todos de ${paciente!.nome} toda quarta-feira às 15:00`) });
  await radio.click();
  const previa = painel.getByRole("status", { name: "Atendimentos atingidos" });
  await expect(previa).toContainText("2 atendimentos (só de agora em diante)");

  // "Este e todos os próximos" inclui o de outro horário.
  await painel.getByRole("radio", { name: new RegExp(`^Este e todos os próximos de ${paciente!.nome}`) }).click();
  await expect(previa).toContainText("3 atendimentos");

  await radio.click();
  await expect(previa).toContainText("2 atendimentos");
  await painel.getByLabel("Motivo da exclusão").fill("Mudou de horário");
  await painel.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(painel).toBeHidden();

  const excluido = async (id: string) => (await admin.from("atendimentos").select("excluido_em").eq("id", id).single()).data!.excluido_em;
  expect(await excluido(base)).not.toBeNull();
  expect(await excluido(depois)).not.toBeNull();
  // O passado, o de outro horário e o do colega ficam.
  expect(await excluido(passado)).toBeNull();
  expect(await excluido(outroHorario)).toBeNull();
  expect(await excluido(doColega)).toBeNull();
});
