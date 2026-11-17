import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Aba "Solicitações": os pedidos dos profissionais (exclusão e inativação), filtráveis
// por profissional, decididos pela recepção ou por um ADM.

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
const profissionais: string[] = [];

async function novoLogin(rotulo: string, perfil: "profissional" | "limitado") {
  let profissionalId: string | null = null;
  if (perfil === "profissional") {
    const { data } = await admin.from("profissionais").insert({ nome: `Zeta Solicitações ${rotulo} ${n}` }).select("id").single();
    profissionalId = data!.id;
    profissionais.push(profissionalId!);
  }
  const email = `solicitacoes.${rotulo.toLowerCase()}.${n}@teste.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome: `Login ${rotulo}` } });
  if (error) throw error;
  logins.push(data.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: profissionalId, nome: `Login ${rotulo}` }).eq("id", data.user.id);
  const api: SupabaseClient = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await api.auth.signInWithPassword({ email, password: SENHA });
  return { email, profissionalId: profissionalId!, nome: `Zeta Solicitações ${rotulo} ${n}`, api };
}

async function novoPaciente(rotulo: string) {
  const { data } = await admin.from("pacientes").insert({ nome: `Paciente Solicitações ${rotulo} ${n}` }).select("id, nome").single();
  return data as { id: string; nome: string };
}

async function atendimento(pacienteId: string, profissionalId: string, dias: number) {
  const inicio = new Date(Date.now() + dias * 86400000);
  inicio.setUTCHours(13, 0, 0, 0);
  const { data } = await admin.from("atendimentos").insert({ paciente_id: pacienteId, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() }).select("id").single();
  await admin.from("atendimento_profissionais").insert({ atendimento_id: data!.id, profissional_id: profissionalId });
  return data!.id as string;
}

async function entrar(browser: Browser, email: string): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  return page;
}

test.afterAll(async () => {
  for (const id of logins) {
    await admin.from("inativacoes_pedidas").delete().eq("pedido_por", id);
    await admin.auth.admin.deleteUser(id);
  }
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("lista os pedidos de exclusão e de inativação, filtra por profissional e decide", async ({ page, browser }) => {
  const a = await novoLogin("A", "profissional");
  const b = await novoLogin("B", "profissional");
  const p1 = await novoPaciente("exclusao");
  const p2 = await novoPaciente("inativacao");
  const [a1, a2] = [await atendimento(p1.id, a.profissionalId, 3), await atendimento(p1.id, a.profissionalId, 8)];
  const b1 = await atendimento(p2.id, b.profissionalId, 4);
  expect((await a.api.rpc("pedir_exclusao_dos_futuros", { p_paciente: p1.id, p_motivo: "Paciente pediu para encerrar" })).error).toBeNull();
  expect((await b.api.rpc("pedir_inativacao", { p_paciente: p2.id, p_motivo: "Alta" })).error).toBeNull();

  await page.goto("/agenda");
  await expect(page.getByRole("link", { name: /Solicitações/ })).toContainText(/\d+/);
  await page.getByRole("link", { name: /Solicitações/ }).click();
  await expect(page.getByRole("heading", { name: "Solicitações" })).toBeVisible();

  const filtro = page.getByRole("radiogroup", { name: "Profissional" });
  const itemExclusao = page.getByRole("listitem", { name: `Exclusão: ${p1.nome}` });
  const itemInativacao = page.getByRole("listitem", { name: `Inativação: ${p2.nome}` });
  // Em "Todos", os dois.
  await expect(itemExclusao).toBeVisible();
  await expect(itemInativacao).toBeVisible();

  await filtro.getByRole("radio", { name: new RegExp(a.nome) }).click();
  await expect(itemInativacao).toHaveCount(0);
  await expect(itemExclusao).toContainText("2 exclusões de atendimentos");
  await expect(itemExclusao).toContainText("Paciente pediu para encerrar");
  await itemExclusao.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(itemExclusao).toHaveCount(0);
  for (const id of [a1, a2]) expect((await admin.from("atendimentos").select("excluido_em").eq("id", id).single()).data!.excluido_em).not.toBeNull();

  await filtro.getByRole("radio", { name: new RegExp(b.nome) }).click();
  await expect(itemInativacao).toContainText("Login B");
  await expect(itemInativacao).toContainText("1 atendimento futuro a excluir");
  await itemInativacao.getByRole("button", { name: "Recusar o pedido" }).click();
  await expect(itemInativacao).toHaveCount(0);
  expect((await admin.from("atendimentos").select("exclusao_solicitada_em").eq("id", b1).single()).data!.exclusao_solicitada_em).toBeNull();
  expect((await admin.from("inativacoes_pedidas").select("decisao").eq("paciente_id", p2.id).single()).data!.decisao).toBe("recusar");

  // A recepção também tem a aba; o profissional não.
  const recepcao = await novoLogin("Recepcao", "limitado");
  const daRecepcao = await entrar(browser, recepcao.email);
  await expect(daRecepcao.getByRole("link", { name: /Solicitações/ })).toBeVisible();
  const doProfissional = await entrar(browser, a.email);
  await expect(doProfissional.getByRole("link", { name: /Solicitações/ })).toHaveCount(0);
  await doProfissional.goto("/solicitacoes");
  await expect(doProfissional).toHaveURL(/\/agenda/);
});
