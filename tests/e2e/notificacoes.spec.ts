import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { painelNovo } from "./ajudantes";

// Aba "Notificações": avisos (exclusões feitas pelos profissionais, para a recepção e o ADM)
// e pendências calculadas (devolutiva a marcar), filtráveis por profissional.

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
  const nome = `Zeta Notificações ${rotulo} ${n}`;
  if (perfil === "profissional") {
    const { data } = await admin.from("profissionais").insert({ nome }).select("id").single();
    profissionalId = data!.id;
    profissionais.push(profissionalId!);
  }
  const email = `notificacoes.${rotulo.toLowerCase()}.${n}@teste.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome: `Login ${rotulo}` } });
  if (error) throw error;
  logins.push(data.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: profissionalId, nome: `Login ${rotulo}` }).eq("id", data.user.id);
  const api: SupabaseClient = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await api.auth.signInWithPassword({ email, password: SENHA });
  return { email, profissionalId: profissionalId!, nome, api };
}

async function novoPaciente(rotulo: string) {
  const { data } = await admin.from("pacientes").insert({ nome: `Paciente Notificações ${rotulo} ${n}` }).select("id, nome").single();
  return data as { id: string; nome: string };
}

async function atendimento(pacienteId: string, profissionalId: string, dias: number, o: { status?: string; tipoId?: string } = {}) {
  const inicio = new Date(Date.now() + dias * 86400000);
  inicio.setUTCHours(13, 0, 0, 0);
  const { data } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pacienteId, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString(), status: o.status ?? "marcado", tipo_id: o.tipoId ?? null })
    .select("id")
    .single();
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
  for (const id of logins) await admin.auth.admin.deleteUser(id);
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("as exclusões dos profissionais viram avisos para a recepção e o ADM, filtráveis e marcáveis como lidos", async ({ page, browser }) => {
  const a = await novoLogin("A", "profissional");
  const b = await novoLogin("B", "profissional");
  const p1 = await novoPaciente("exclusao");
  const p2 = await novoPaciente("ocultacao");
  const a1 = await atendimento(p1.id, a.profissionalId, 3);
  await atendimento(p2.id, b.profissionalId, 4);
  expect((await a.api.rpc("profissional_excluir_atendimentos", { p_id: a1, p_alcance: "este", p_motivo: "Paciente pediu para encerrar" })).error).toBeNull();
  expect((await b.api.rpc("ocultar_paciente", { p_paciente: p2.id, p_motivo: "Alta" })).error).toBeNull();

  await page.goto("/agenda");
  await expect(page.getByRole("link", { name: /Notificações/ })).toContainText(/\d+/);
  await page.getByRole("link", { name: /Notificações/ }).click();
  await expect(page.getByRole("heading", { name: "Notificações" })).toBeVisible();

  const avisos = page.getByRole("region", { name: "Avisos" });
  const deA = avisos.getByRole("listitem", { name: `Exclusão: ${p1.nome}` });
  const deB = avisos.getByRole("listitem", { name: `Ocultou: ${p2.nome}` });
  await expect(deA).toContainText("Login A excluiu 1 atendimento de");
  await expect(deA).toContainText("Paciente pediu para encerrar");
  await expect(deB).toContainText("Login B ocultou");

  const filtro = page.getByRole("radiogroup", { name: "Profissional" });
  await filtro.getByRole("radio", { name: a.nome }).click();
  await expect(deB).toHaveCount(0);
  await expect(deA).toBeVisible();
  await deA.getByRole("button", { name: "Marcar como lido" }).click();
  await expect(deA.getByRole("button", { name: "Marcar como lido" })).toHaveCount(0);
  await expect(deA.getByLabel("Não lido")).toHaveCount(0);

  // A recepção também recebe; o profissional tem a aba, mas sem os avisos.
  const recepcao = await novoLogin("Recepcao", "limitado");
  const daRecepcao = await entrar(browser, recepcao.email);
  await daRecepcao.getByRole("link", { name: /Notificações/ }).click();
  await expect(daRecepcao.getByRole("listitem", { name: `Exclusão: ${p1.nome}` })).toBeVisible();
  // Lido é de cada um: para a recepção, ainda não.
  await expect(daRecepcao.getByRole("listitem", { name: `Exclusão: ${p1.nome}` }).getByRole("button", { name: "Marcar como lido" })).toBeVisible();
  const doProfissional = await entrar(browser, a.email);
  await doProfissional.getByRole("link", { name: /Notificações/ }).click();
  await expect(doProfissional.getByRole("region", { name: "Avisos" })).toHaveCount(0);
  expect((await a.api.from("notificacoes").select("id")).data).toEqual([]);
});

test("devolutiva: pendência com faltas em 30 dias ou a cada 15 atendimentos ou 1 mês, e some quando é marcada", async ({ page, browser }) => {
  const { data: tipo } = await admin.from("tipos_atendimento").select("id").eq("devolutiva", true).limit(1).single();
  const devolutiva = tipo!.id as string;
  const z = await novoLogin("Devolutiva", "profissional");

  // 3 faltas em 30 dias (com 6 atendimentos na janela).
  const tresFaltas = await novoPaciente("tres faltas");
  for (const d of [-2, -5, -8]) await atendimento(tresFaltas.id, z.profissionalId, d, { status: "faltou" });
  for (const d of [-3, -6, -9]) await atendimento(tresFaltas.id, z.profissionalId, d, { status: "atendido" });
  // Atendido 1 vez por semana: bastam 2 faltas.
  const semanal = await novoPaciente("semanal");
  for (const d of [-3, -10]) await atendimento(semanal.id, z.profissionalId, d, { status: "faltou" });
  for (const d of [-17, -24]) await atendimento(semanal.id, z.profissionalId, d, { status: "atendido" });
  // 2 faltas com mais de 5 atendimentos na janela: ainda não.
  const duasFaltas = await novoPaciente("duas faltas");
  for (const d of [-2, -9]) await atendimento(duasFaltas.id, z.profissionalId, d, { status: "faltou" });
  for (const d of [-3, -4, -5, -6]) await atendimento(duasFaltas.id, z.profissionalId, d, { status: "atendido" });
  // 15 atendimentos desde a última devolutiva.
  const quinze = await novoPaciente("quinze");
  await atendimento(quinze.id, z.profissionalId, -20, { status: "atendido", tipoId: devolutiva });
  for (let d = -19; d <= -5; d++) await atendimento(quinze.id, z.profissionalId, d, { status: "atendido" });
  // Mais de 1 mês desde a última devolutiva.
  const umMes = await novoPaciente("um mes");
  await atendimento(umMes.id, z.profissionalId, -40, { status: "atendido", tipoId: devolutiva });
  await atendimento(umMes.id, z.profissionalId, -10, { status: "atendido" });

  await page.goto("/notificacoes");
  const pendencias = page.getByRole("region", { name: "Pendências" });
  const item = (p: { nome: string }) => pendencias.getByRole("listitem", { name: `Devolutiva: ${p.nome}` });
  await expect(item(tresFaltas)).toContainText("3 faltas nos últimos 30 dias");
  await expect(item(semanal)).toContainText("2 faltas nos últimos 30 dias");
  await expect(item(duasFaltas)).toHaveCount(0);
  await expect(item(quinze)).toContainText("15 atendimentos desde a última devolutiva");
  await expect(item(umMes)).toContainText("há mais de 1 mês");
  await expect(item(tresFaltas)).toContainText(z.nome);

  // O profissional também recebe as dos pacientes dele.
  const doProfissional = await entrar(browser, z.email);
  await doProfissional.goto("/notificacoes");
  await expect(doProfissional.getByRole("listitem", { name: `Devolutiva: ${tresFaltas.nome}` })).toBeVisible();

  // "Marcar devolutiva" abre o novo atendimento com o paciente e o tipo.
  await item(tresFaltas).getByRole("button", { name: "Marcar devolutiva" }).click();
  const form = painelNovo(page);
  await expect(form.getByLabel("Paciente")).toHaveValue(tresFaltas.nome);
  await expect(form.getByLabel("Tipo")).toHaveValue(devolutiva);
  await form.getByRole("button", { name: "Fechar" }).click();

  // Com uma devolutiva marcada, a pendência some.
  await atendimento(tresFaltas.id, z.profissionalId, 5, { tipoId: devolutiva });
  await page.reload();
  await expect(item(tresFaltas)).toHaveCount(0);
  await expect(item(semanal)).toBeVisible();
});
