import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { cardDoPaciente, painelDetalhes } from "./ajudantes";

// O "+" de quem atende: agendar, realizar (avulso ou o marcado para agora) e anamnese.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const senha = `senha-teste-${n}`;
const logins: string[] = [];
let contas = 0;

type Conta = { email: string; profissionalId: string };

async function novaConta(perfil: string, comProfissional = true): Promise<Conta> {
  const apelido = `mais${++contas}.${n}`;
  const email = `${apelido}@teste.local`;
  const { data: prof } = comProfissional ? await admin.from("profissionais").insert({ nome: `Dra. ${apelido}` }).select("id").single() : { data: null };
  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome: apelido } });
  if (criado.error) throw criado.error;
  logins.push(criado.data.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: prof?.id ?? null }).eq("id", criado.data.user.id);
  return { email, profissionalId: prof?.id ?? "" };
}

async function entrar(browser: Browser, conta: Conta): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 1300, height: 900 } });
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(conta.email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  return page;
}

async function novoPaciente(nome: string) {
  const { data } = await admin.from("pacientes").insert({ nome }).select("id").single();
  return data!.id as string;
}

/** Atendimento acontecendo agora, ou nos minutos indicados a partir de agora. */
async function marcar(profissionalId: string, pacienteId: string, { inicioEmMin = -10, tipoId = null as string | null } = {}) {
  const inicio = new Date(Date.now() + inicioEmMin * 60_000);
  const { data } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pacienteId, tipo_id: tipoId, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60_000).toISOString() })
    .select("id")
    .single();
  await admin.from("atendimento_profissionais").insert({ atendimento_id: data!.id, profissional_id: profissionalId });
  return data!.id as string;
}

const tipoAnamnese = async () => (await admin.from("tipos_atendimento").select("id").eq("nome", "Anamnese").single()).data!.id as string;

async function opcaoDoMais(page: Page, opcao: string) {
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await page.getByRole("menuitem", { name: opcao }).click();
}

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
});

test("quem atende vê as três opções; ADM sem profissional agenda direto", async ({ browser }) => {
  const page = await entrar(browser, await novaConta("profissional"));
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  for (const opcao of ["Agendar um atendimento", "Realizar um atendimento", "Realizar uma anamnese"]) await expect(page.getByRole("menuitem", { name: opcao })).toBeVisible();
  await page.getByRole("menuitem", { name: "Agendar um atendimento" }).click();
  await expect(page.getByRole("dialog", { name: "Novo atendimento" })).toBeVisible();
  await page.context().close();

  const comVinculo = await entrar(browser, await novaConta("adm"));
  await comVinculo.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(comVinculo.getByRole("menuitem", { name: "Realizar um atendimento" })).toBeVisible();
  await comVinculo.context().close();

  const semVinculo = await entrar(browser, await novaConta("adm", false));
  await semVinculo.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(semVinculo.getByRole("menu")).toHaveCount(0);
  await expect(semVinculo.getByRole("dialog", { name: "Novo atendimento" })).toBeVisible();
  await semVinculo.context().close();
});

test("sem ninguém marcado, o atendimento avulso entra no calendário e abre para escrever", async ({ browser }) => {
  const conta = await novaConta("profissional");
  const paciente = `Paciente Avulso ${n}`;
  const pacienteId = await novoPaciente(paciente);
  const page = await entrar(browser, conta);

  await opcaoDoMais(page, "Realizar um atendimento");
  const painel = page.getByRole("dialog", { name: "Realizar um atendimento" });
  await expect(painel.getByLabel("Status")).toHaveCount(0);
  await expect(painel.getByText("Repetir")).toHaveCount(0);
  await painel.getByLabel("Paciente").fill(paciente);
  await painel.getByRole("option", { name: paciente }).click();
  await painel.getByRole("button", { name: "Iniciar atendimento" }).click();

  await expect(page).toHaveURL(/\/atendimento\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: paciente })).toBeVisible();
  const id = page.url().split("/").pop()!;
  const { data } = await admin.from("atendimentos").select("paciente_id, status, inicio, profissionais:atendimento_profissionais(profissional_id)").eq("id", id).single();
  expect(data!.paciente_id).toBe(pacienteId);
  expect(data!.status).toBe("marcado");
  expect(data!.profissionais.map((p) => p.profissional_id)).toEqual([conta.profissionalId]);
  expect(Math.abs(Date.now() - new Date(data!.inicio).getTime())).toBeLessThan(6 * 60_000);

  await page.goto("/agenda");
  await expect(cardDoPaciente(page, paciente)).toHaveCount(1);
  await page.context().close();
});

test("com paciente marcado para agora, pergunta antes de abrir um novo", async ({ browser }) => {
  const conta = await novaConta("profissional");
  const paciente = `Paciente Marcado ${n}`;
  const marcado = await marcar(conta.profissionalId, await novoPaciente(paciente));
  const outro = await novaConta("profissional");
  await marcar(outro.profissionalId, await novoPaciente(`De Outro ${n}`));
  const page = await entrar(browser, conta);
  const quantos = async () => (await admin.from("atendimento_profissionais").select("atendimento_id").eq("profissional_id", conta.profissionalId)).data!.length;

  await opcaoDoMais(page, "Realizar um atendimento");
  const pergunta = page.getByRole("alertdialog", { name: "Paciente marcado agora" });
  await expect(pergunta).toContainText("Há um paciente marcado");
  await expect(pergunta).not.toContainText("De Outro");

  // Cancelar não abre nada.
  await pergunta.getByRole("button", { name: "Cancelar" }).click();
  await expect(pergunta).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Realizar um atendimento" })).toHaveCount(0);

  // "Não" segue para o avulso.
  await opcaoDoMais(page, "Realizar um atendimento");
  await pergunta.getByRole("button", { name: "Não, é outro paciente" }).click();
  const painel = page.getByRole("dialog", { name: "Realizar um atendimento" });
  await expect(painel).toBeVisible();
  await painel.getByRole("button", { name: "Cancelar" }).click();

  // "Sim" abre o marcado, sem criar outro.
  await opcaoDoMais(page, "Realizar um atendimento");
  await pergunta.getByRole("button", { name: new RegExp(`Sim, abrir ${paciente}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/atendimento/${marcado}`));
  expect(await quantos()).toBe(1);
  await page.context().close();
});

test("não pergunta sobre o que ainda vai demorar nem sobre o já realizado", async ({ browser }) => {
  const conta = await novaConta("profissional");
  await marcar(conta.profissionalId, await novoPaciente(`Mais Tarde ${n}`), { inicioEmMin: 60 });
  const realizado = await marcar(conta.profissionalId, await novoPaciente(`Realizado ${n}`));
  await admin.from("atendimentos").update({ status: "atendido" }).eq("id", realizado);
  const page = await entrar(browser, conta);
  await opcaoDoMais(page, "Realizar um atendimento");
  await expect(page.getByRole("dialog", { name: "Realizar um atendimento" })).toBeVisible();
  await page.context().close();
});

test("agendamento do tipo Anamnese abre a anamnese, e salvar a marca como atendido", async ({ browser }) => {
  const conta = await novaConta("profissional");
  await admin.from("anamnese_perguntas").insert({ profissional_id: conta.profissionalId, texto: "Queixa principal", ordem: 1 });
  const paciente = `Paciente Anamnese ${n}`;
  const id = await marcar(conta.profissionalId, await novoPaciente(paciente), { tipoId: await tipoAnamnese() });
  const page = await entrar(browser, conta);

  await page.goto("/agenda");
  await cardDoPaciente(page, paciente).click();
  await expect(painelDetalhes(page).getByRole("link", { name: "Realizar atendimento" })).toHaveCount(0);
  await painelDetalhes(page).getByRole("link", { name: "Realizar anamnese" }).click();
  await expect(page).toHaveURL(/\/anamnese\/[0-9a-f-]{36}/);
  const anamneseId = page.url().split("/").pop()!;
  await page.getByLabel("Queixa principal").fill("Dificuldade na fala");

  // O endereço do registro leva à mesma anamnese, e a agenda oferece continuar.
  await page.goto(`/atendimento/${id}`);
  await expect(page).toHaveURL(new RegExp(`/anamnese/${anamneseId}`));
  await page.goto("/agenda");
  await cardDoPaciente(page, paciente).click();
  await painelDetalhes(page).getByRole("link", { name: "Continuar anamnese" }).click();
  await expect(page).toHaveURL(new RegExp(`/anamnese/${anamneseId}`));

  await page.getByRole("button", { name: "Salvar no histórico" }).click();
  await expect(page.getByRole("heading", { name: "Histórico de versões" })).toBeVisible();
  expect((await admin.from("atendimentos").select("status").eq("id", id).single()).data!.status).toBe("atendido");
  expect((await admin.from("anamneses").select("atendimento_id").eq("id", anamneseId).single()).data!.atendimento_id).toBe(id);

  await page.goto("/agenda");
  await cardDoPaciente(page, paciente).click();
  await expect(painelDetalhes(page).getByRole("link", { name: "Ver anamnese" })).toHaveAttribute("href", `/anamnese/${anamneseId}`);
  await page.context().close();
});

test("realizar uma anamnese: pergunta só sobre o agendamento de anamnese", async ({ browser }) => {
  const conta = await novaConta("profissional");
  const paciente = `Marcado Anamnese ${n}`;
  await marcar(conta.profissionalId, await novoPaciente(`Sessão Comum ${n}`));
  const page = await entrar(browser, conta);

  // Só um atendimento comum agora: não pergunta, e a anamnese avulsa entra no calendário.
  const avulso = `Anamnese Avulsa ${n}`;
  const avulsoId = await novoPaciente(avulso);
  await opcaoDoMais(page, "Realizar uma anamnese");
  const painel = page.getByRole("dialog", { name: "Realizar uma anamnese" });
  await expect(painel.getByLabel("Tipo")).toHaveCount(0);
  await painel.getByLabel("Paciente").fill(avulso);
  await painel.getByRole("option", { name: avulso }).click();
  await painel.getByRole("button", { name: "Iniciar anamnese" }).click();
  await expect(page).toHaveURL(/\/anamnese\/[0-9a-f-]{36}/);
  const criado = await admin.from("atendimentos").select("id, tipo_id, status").eq("paciente_id", avulsoId).single();
  expect(criado.data!.tipo_id).toBe(await tipoAnamnese());
  expect(criado.data!.status).toBe("marcado");
  expect((await admin.from("anamneses").select("id").eq("atendimento_id", criado.data!.id)).data).toHaveLength(1);

  const anamnese = await marcar(conta.profissionalId, await novoPaciente(paciente), { tipoId: await tipoAnamnese() });
  await page.goto("/agenda");
  await opcaoDoMais(page, "Realizar uma anamnese");
  const pergunta = page.getByRole("alertdialog", { name: "Paciente marcado agora" });
  await expect(pergunta).not.toContainText("Sessão Comum");
  await pergunta.getByRole("button", { name: new RegExp(`Sim, abrir ${paciente}`) }).click();
  await expect(page).toHaveURL(/\/anamnese\/[0-9a-f-]{36}/);
  expect((await admin.from("anamneses").select("atendimento_id").eq("atendimento_id", anamnese)).data).toHaveLength(1);
  await page.context().close();
});

test("outro profissional não abre a anamnese de um atendimento que não é dele", async ({ browser }) => {
  const dono = await novaConta("profissional");
  const id = await marcar(dono.profissionalId, await novoPaciente(`Alheio ${n}`), { tipoId: await tipoAnamnese() });
  const page = await entrar(browser, await novaConta("profissional"));
  await page.goto(`/anamnese?atendimento=${id}`);
  await expect(page.getByText("próprios atendimentos")).toBeVisible();
  expect((await admin.from("anamneses").select("id").eq("atendimento_id", id)).data).toHaveLength(0);
  await page.context().close();
});
