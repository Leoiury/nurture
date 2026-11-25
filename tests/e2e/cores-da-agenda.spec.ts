import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { diaDaSemanaAtual } from "./ajudantes";

// Agenda completa: o ADM alterna a cor dos cards entre planos e status, e a escolha fica.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const n = Date.now();
const dia = diaDaSemanaAtual(3);
// Cores padrão por status: marcado azul, confirmado verde.
const AZUL = /rgb\(74, 144, 217\)|#4a90d9/i;
const VERDE_DO_PLANO = /rgb\(22, 163, 74\)|#16a34a/i;
let profissionalId: string;

test.afterAll(async () => {
  if (profissionalId) await admin.from("profissionais").update({ ativo: false }).eq("id", profissionalId);
});

test("ADM alterna as cores dos cards entre planos e status", async ({ page }) => {
  const { data: plano } = await admin.from("planos").insert({ nome: `Plano Cores ${n}`, cor: "#16a34a" }).select("id").single();
  const { data: prof } = await admin.from("profissionais").insert({ nome: `Zeta Cores ${n}` }).select("id").single();
  profissionalId = prof!.id;
  const { data: pac } = await admin.from("pacientes").insert({ nome: `Paciente Cores Agenda ${n}` }).select("id").single();
  const inicio = new Date(`${dia}T16:00:00-03:00`);
  const { data: a } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pac!.id, plano_id: plano!.id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() })
    .select("id")
    .single();
  await admin.from("atendimento_profissionais").insert({ atendimento_id: a!.id, profissional_id: profissionalId });

  await page.goto(`/agenda?dia=${dia}`);
  const card = page.locator(`button[data-atendimento="${a!.id}"]`);
  await expect(card).toHaveAttribute("style", VERDE_DO_PLANO);

  const menu = page.getByRole("dialog", { name: "Filtros da agenda" });
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  const cores = menu.getByRole("radiogroup", { name: "Cores dos cards" });
  await expect(cores.getByRole("radio", { name: "Planos" })).toBeChecked();
  await cores.getByRole("radio", { name: "Status" }).click();
  await expect(card).toHaveAttribute("style", AZUL);
  await expect(menu.getByRole("heading", { name: "Status" })).toBeVisible();

  // A escolha fica ao recarregar; voltar para planos.
  await page.reload();
  await expect(page.locator(`button[data-atendimento="${a!.id}"]`)).toHaveAttribute("style", AZUL);
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await cores.getByRole("radio", { name: "Planos" }).click();
  await expect(page.locator(`button[data-atendimento="${a!.id}"]`)).toHaveAttribute("style", VERDE_DO_PLANO);
});
