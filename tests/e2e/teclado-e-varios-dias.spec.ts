import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { cadastrarPacienteNovo, diaDaSemanaAtual, painelDetalhes, painelNovo } from "./ajudantes";

// Novo atendimento em vários dias (cada um com o seu horário) e a agenda pelo teclado:
// horário selecionado, setas, N para marcar, Enter para abrir, Ctrl+C / Ctrl+V para duplicar.

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
// Semanas futuras, às terças.
const tercaDaSemana = (semanas: number) => somarDias(diaDaSemanaAtual(1), 7 * semanas);
const horaNoFuso = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dataNoFuso = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

test.afterAll(async () => {
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("lança em vários dias, cada um com o seu horário, com repetição", async ({ page }) => {
  const nome = `Paciente Vários Dias ${n}`;
  const terca = tercaDaSemana(2);
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await cadastrarPacienteNovo(page, nome);
  const form = painelNovo(page);
  await form.getByLabel("Profissionais").selectOption({ index: 1 });
  await form.getByLabel("Data", { exact: true }).fill(terca);
  await form.getByLabel("Início", { exact: true }).fill("12:15");

  // Outro dia: vem no dia seguinte, no mesmo horário, e pode mudar.
  await form.getByRole("button", { name: "+ Outro dia" }).click();
  const dia2 = form.getByRole("group", { name: "Dia 2" });
  await expect(dia2.getByLabel("Data do dia 2")).toHaveValue(somarDias(terca, 1));
  await expect(dia2.getByLabel("Início do dia 2")).toHaveValue("12:15");
  await dia2.getByLabel("Data do dia 2").fill(somarDias(terca, 2));
  await dia2.getByLabel("Início do dia 2").fill("14:30");
  await expect(form.getByRole("button", { name: "Salvar 2 atendimentos" })).toBeVisible();

  // Com repetição, cada dia vira uma série.
  await form.getByText("Repetir", { exact: true }).click();
  await form.getByRole("radio", { name: "Toda semana" }).click();
  await form.getByLabel("Número de sessões").fill("3");
  await form.getByRole("button", { name: "Salvar 6 atendimentos" }).click();
  await expect(form).toBeHidden();

  const { data: paciente } = await admin.from("pacientes").select("id").eq("nome", nome).single();
  const { data: criados } = await admin.from("atendimentos").select("inicio, recorrencia_id").eq("paciente_id", paciente!.id).is("excluido_em", null).order("inicio");
  expect(criados!.map((a) => `${dataNoFuso(a.inicio)} ${horaNoFuso(a.inicio)}`)).toEqual([
    `${terca} 12:15`,
    `${somarDias(terca, 2)} 14:30`,
    `${somarDias(terca, 7)} 12:15`,
    `${somarDias(terca, 9)} 14:30`,
    `${somarDias(terca, 14)} 12:15`,
    `${somarDias(terca, 16)} 14:30`,
  ]);
  expect(new Set(criados!.map((a) => a.recorrencia_id)).size).toBe(2);
});

async function semCompactar(page: Page) {
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Filtros da agenda" });
  const compactar = menu.getByRole("switch", { name: "Compactar horários vazios" });
  await compactar.setChecked(false, { force: true });
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeInViewport();
}

test("pelo teclado: seleciona o horário, cola a série copiada, marca com N e abre com Enter", async ({ page }) => {
  const dia = tercaDaSemana(3);
  const { data: prof } = await admin.from("profissionais").insert({ nome: `Zeta Teclado ${n}` }).select("id").single();
  profissionais.push(prof!.id);
  const { data: paciente } = await admin.from("pacientes").insert({ nome: `Paciente Teclado ${n}` }).select("id, nome").single();
  // Uma série semanal de 3 sessões, às 10:00.
  const { data: serie } = await admin.from("recorrencias").insert({ frequencia: "semanal", data_inicio: dia, sessoes: 3 }).select("id").single();
  const ids: string[] = [];
  for (const semana of [0, 1, 2]) {
    const inicio = new Date(`${somarDias(dia, 7 * semana)}T10:00:00-03:00`);
    const { data: a } = await admin
      .from("atendimentos")
      .insert({ paciente_id: paciente!.id, recorrencia_id: serie!.id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() })
      .select("id")
      .single();
    await admin.from("atendimento_profissionais").insert({ atendimento_id: a!.id, profissional_id: prof!.id });
    ids.push(a!.id);
  }

  await page.goto(`/agenda?dia=${dia}`);
  await semCompactar(page);
  const card = page.locator(`button[data-atendimento="${ids[0]}"]`);

  // Copia pelo painel do atendimento.
  await card.click();
  await expect(painelDetalhes(page)).toBeVisible();
  await page.keyboard.press("Control+c");
  await expect(page.getByRole("status").filter({ hasText: `Copiado: ${paciente!.nome}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(painelDetalhes(page)).toBeHidden();

  // Um clique simples logo acima do card seleciona o horário (09:45), sem abrir nada.
  const caixa = (await card.boundingBox())!;
  await page.mouse.click(caixa.x + caixa.width / 2, caixa.y - 6);
  const cursor = page.locator("[data-cursor]");
  await expect(cursor).toHaveAttribute("data-cursor", `${dia}|${prof!.id}|09:45`);
  await expect(painelNovo(page)).toHaveCount(0);

  // Setas: 15 em 15 minutos.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(cursor).toHaveAttribute("data-cursor", `${dia}|${prof!.id}|09:15`);

  // Ctrl+V: a série inteira, a partir do horário escolhido, com o mesmo paciente.
  await page.keyboard.press("Control+v");
  await expect(page.getByRole("status").filter({ hasText: "Colado: 3 atendimentos" })).toBeVisible();
  const { data: todos } = await admin.from("atendimentos").select("inicio, recorrencia_id").eq("paciente_id", paciente!.id).is("excluido_em", null).order("inicio");
  const colados = todos!.filter((a) => horaNoFuso(a.inicio) === "09:15");
  expect(colados.map((a) => dataNoFuso(a.inicio))).toEqual([dia, somarDias(dia, 7), somarDias(dia, 14)]);
  expect(colados[0].recorrencia_id).not.toBe(serie!.id);

  // N: novo atendimento no horário selecionado.
  await page.keyboard.press("n");
  await expect(painelNovo(page).getByLabel("Início", { exact: true })).toHaveValue("09:15");
  await page.keyboard.press("Escape");
  await expect(painelNovo(page)).toHaveCount(0);

  // Enter sobre o card original abre os detalhes.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await expect(cursor).toHaveAttribute("data-cursor", `${dia}|${prof!.id}|10:00`);
  await page.keyboard.press("Enter");
  await expect(painelDetalhes(page)).toContainText(paciente!.nome);
});
