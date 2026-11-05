import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Inativar avisa dos atendimentos marcados, bloqueia o login de profissional e nunca o de ADM.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SENHA = `senha-teste-${n}`;
const logins: string[] = [];

async function novoProfissional(rotulo: string, perfil: "profissional" | "adm") {
  const nome = `Inativar ${rotulo} ${n}`;
  const { data: prof } = await admin.from("profissionais").insert({ nome }).select("id").single();
  const email = `inativar.${rotulo}.${n}@teste.local`;
  const { data: criado, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome } });
  if (error) throw error;
  logins.push(criado.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: prof!.id }).eq("id", criado.user.id);
  return { id: prof!.id as string, nome, email, usuarioId: criado.user.id };
}

const consegueEntrar = async (email: string) => !(await novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).auth.signInWithPassword({ email, password: SENHA })).error;

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
});

test("avisa os atendimentos marcados, bloqueia o login, e reativar não devolve o acesso", async ({ page }) => {
  const prof = await novoProfissional("comum", "profissional");
  const paciente = `Paciente Inativar ${n}`;
  const { data: pac } = await admin.from("pacientes").insert({ nome: paciente }).select("id").single();
  // Longe no futuro: o aviso conta todos, e não só os próximos dias.
  const inicio = new Date(Date.now() + 120 * 864e5);
  const { data: at } = await admin.from("atendimentos").insert({ paciente_id: pac!.id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() }).select("id").single();
  await admin.from("atendimento_profissionais").insert({ atendimento_id: at!.id, profissional_id: prof.id });

  await page.goto(`/profissionais/${prof.id}`);
  await page.getByRole("button", { name: "Inativar", exact: true }).click();
  const aviso = page.getByRole("alertdialog", { name: "Inativar profissional" });
  await expect(aviso).toContainText("Há 1 atendimento marcado que precisa de revisão");
  await expect(aviso).toContainText(paciente);

  // Voltar para revisar não muda nada.
  await aviso.getByRole("button", { name: "Revisar antes" }).click();
  await expect(aviso).toBeHidden();
  expect((await admin.from("profissionais").select("ativo").eq("id", prof.id).single()).data!.ativo).toBe(true);
  expect(await consegueEntrar(prof.email)).toBe(true);

  await page.getByRole("button", { name: "Inativar", exact: true }).click();
  await aviso.getByRole("button", { name: "Inativar mesmo assim" }).click();
  await expect(page.getByRole("status").filter({ hasText: "O login foi bloqueado." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("inativo");
  expect((await admin.from("profissionais").select("ativo").eq("id", prof.id).single()).data!.ativo).toBe(false);
  expect((await admin.from("usuarios").select("ativo").eq("id", prof.usuarioId).single()).data!.ativo).toBe(false);
  expect(await consegueEntrar(prof.email)).toBe(false);

  await page.getByRole("button", { name: "Reativar", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Reativar profissional" }).getByRole("button", { name: "Reativar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "continua bloqueado" })).toBeVisible();
  expect((await admin.from("profissionais").select("ativo").eq("id", prof.id).single()).data!.ativo).toBe(true);
  expect(await consegueEntrar(prof.email)).toBe(false);
});

test("o login de ADM vinculado continua funcionando", async ({ page }) => {
  const prof = await novoProfissional("adm", "adm");
  await page.goto(`/profissionais/${prof.id}`);
  await page.getByRole("button", { name: "Inativar", exact: true }).click();
  const aviso = page.getByRole("alertdialog", { name: "Inativar profissional" });
  await expect(aviso).toContainText("Não há atendimentos marcados");
  await aviso.getByRole("button", { name: "Inativar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "login de administrador vinculado continua ativo" })).toBeVisible();
  expect((await admin.from("usuarios").select("ativo").eq("id", prof.usuarioId).single()).data!.ativo).toBe(true);
  expect(await consegueEntrar(prof.email)).toBe(true);
});
