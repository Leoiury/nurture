import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Anamnese: cada profissional com suas perguntas, cópia das perguntas em cada anamnese,
// versões, e o conteúdo clínico fechado para a recepção (conferido direto na API).

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);

const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const senha = `senha-teste-${n}`;
const NOME_PACIENTE = `Paciente Anamnese ${n}`;
const logins: string[] = [];
let pacienteId: string;
let profissionalId: string;
let eu: Conta;
let colega: Conta;
let recepcao: Conta;

type Conta = { email: string; api: SupabaseClient };

async function novaConta(apelido: string, perfil: string, profissional: string | null): Promise<Conta> {
  const email = `${apelido}.${n}@teste.local`;
  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome: apelido } });
  if (criado.error) throw criado.error;
  logins.push(criado.data.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: profissional }).eq("id", criado.data.user.id);
  const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const login = await api.auth.signInWithPassword({ email, password: senha });
  if (login.error) throw login.error;
  return { email, api };
}

async function entrar(browser: Browser, conta: Conta): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 1200, height: 900 } });
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(conta.email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  return page;
}

const textoDasPerguntas = (page: Page) => page.getByRole("list", { name: "Perguntas" }).locator("input").evaluateAll((campos) => campos.map((c) => (c as HTMLInputElement).value));

async function adicionarPergunta(page: Page, texto: string) {
  await expect(page.getByRole("heading", { name: "Editar anamnese" })).toBeVisible();
  const total = await page.getByRole("list", { name: "Perguntas" }).locator("li").count();
  await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
  const campo = page.getByLabel(`Pergunta ${total + 1}`, { exact: true });
  await expect(campo).toBeFocused();
  await campo.fill(texto);
  await campo.blur();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const profs = await admin.from("profissionais").insert([{ nome: `Autor Anamnese ${n}` }, { nome: `Colega Anamnese ${n}` }]).select("id");
  if (profs.error) throw profs.error;
  profissionalId = profs.data[0].id;
  const paciente = await admin.from("pacientes").insert({ nome: NOME_PACIENTE }).select("id").single();
  if (paciente.error) throw paciente.error;
  pacienteId = paciente.data.id;
  eu = await novaConta("autor", "profissional", profissionalId);
  colega = await novaConta("colega", "profissional", profs.data[1].id);
  recepcao = await novaConta("recepcao", "limitado", null);
});

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
});

test("edita as próprias perguntas: adiciona, reordena, exclui", async ({ browser }) => {
  const page = await entrar(browser, eu);
  await page.goto("/conta");
  await page.getByRole("link", { name: "Editar anamnese" }).click();
  await expect(page.getByRole("heading", { name: "Editar anamnese" })).toBeVisible();

  await adicionarPergunta(page, "Queixa principal");
  await adicionarPergunta(page, "Histórico familiar");
  await adicionarPergunta(page, "Pergunta descartável");
  await expect(page.getByRole("region", { name: "Observações" })).toContainText("Campo fixo");

  await page.getByRole("button", { name: "Excluir: Pergunta descartável" }).click();
  await expect.poll(() => textoDasPerguntas(page)).toEqual(["Queixa principal", "Histórico familiar"]);

  // Segura o ícone da segunda pergunta e arrasta para cima.
  const icone = (await page.getByRole("button", { name: "Reordenar: Histórico familiar" }).boundingBox())!;
  const alvo = (await page.getByRole("list", { name: "Perguntas" }).locator("li").first().boundingBox())!;
  await page.mouse.move(icone.x + icone.width / 2, icone.y + icone.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(icone.x + icone.width / 2, icone.y + ((alvo.y + alvo.height / 2 - icone.y) * i) / 8);
  await page.mouse.up();
  await expect.poll(() => textoDasPerguntas(page)).toEqual(["Histórico familiar", "Queixa principal"]);

  await expect.poll(async () => (await admin.from("anamnese_perguntas").select("texto").eq("profissional_id", profissionalId).order("ordem")).data!.map((p) => p.texto)).toEqual(["Histórico familiar", "Queixa principal"]);
  await page.context().close();
});

test("o modelo é de cada profissional", async () => {
  expect((await colega.api.from("anamnese_perguntas").select("id")).data).toEqual([]);
  const { data: minhas } = await eu.api.from("anamnese_perguntas").select("id");
  expect(minhas!.length).toBe(2);
  await colega.api.from("anamnese_perguntas").delete().eq("id", minhas![0].id);
  await colega.api.from("anamnese_perguntas").update({ texto: "Invadido" }).eq("id", minhas![0].id);
  expect((await eu.api.from("anamnese_perguntas").select("texto")).data!.map((p) => p.texto)).not.toContain("Invadido");
  expect((await eu.api.from("anamnese_perguntas").select("id")).data!.length).toBe(2);
});

test("preenche, guarda sozinho, salva no histórico; as perguntas ficam como eram", async ({ browser }) => {
  const page = await entrar(browser, eu);
  await page.goto("/pacientes");
  await page.getByRole("link", { name: "Nova anamnese" }).click();
  await page.getByLabel("Paciente", { exact: true }).fill(NOME_PACIENTE);
  await page.getByRole("button", { name: NOME_PACIENTE }).click();
  await expect(page).toHaveURL(/\/anamnese\/[0-9a-f-]{36}/);
  const url = page.url();
  await expect(page.getByRole("link", { name: "Editar anamnese" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar consulta" })).toBeVisible();

  // Sair sem salvar não perde o texto.
  await page.getByLabel("Queixa principal").fill("Dificuldade para dormir");
  await page.getByLabel("Observações").fill("Primeira conversa");
  await expect(page.getByRole("status")).toHaveText("Texto guardado");
  await page.goto("/agenda");
  await page.goto(url);
  await expect(page.getByLabel("Queixa principal")).toHaveValue("Dificuldade para dormir");
  await expect(page.getByLabel("Observações")).toHaveValue("Primeira conversa");

  // Em andamento: só o autor vê.
  const id = url.split("/").at(-1)!;
  expect((await colega.api.from("anamneses").select("id").eq("id", id)).data).toEqual([]);

  await page.getByRole("button", { name: "Salvar no histórico" }).click();
  await expect(page.getByRole("region", { name: "Histórico de versões" })).toContainText("Versão 1 (atual)");
  await expect(page.getByText("Dificuldade para dormir")).toBeVisible();

  // Pergunta nova no modelo não entra na anamnese salva, e a excluída continua nela.
  await page.goto("/anamnese/editar?voltar=/conta");
  await adicionarPergunta(page, "Pergunta posterior");
  await page.getByRole("button", { name: "Excluir: Queixa principal" }).click();
  await expect.poll(() => textoDasPerguntas(page)).toEqual(["Histórico familiar", "Pergunta posterior"]);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Queixa principal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pergunta posterior" })).toHaveCount(0);

  // Editar gera nova versão; a anterior continua disponível.
  await page.getByRole("link", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salvar nova versão" })).toBeVisible();
  await expect(page.getByLabel("Pergunta posterior")).toHaveCount(0);
  await page.getByLabel("Queixa principal").fill("Melhorou depois da conversa");
  await page.getByRole("button", { name: "Salvar nova versão" }).click();
  await expect(page.getByRole("region", { name: "Histórico de versões" })).toContainText("Versão 2 (atual)");
  await expect(page.getByText("Melhorou depois da conversa")).toBeVisible();

  await page.getByRole("link", { name: /^Versão 1/ }).click();
  await expect(page.getByText("Dificuldade para dormir")).toBeVisible();
  await expect(page.getByText("Versão 1 de 2")).toBeVisible();

  // Aparece na página do paciente.
  await page.goto(`/pacientes/${pacienteId}`);
  await expect(page.getByRole("region", { name: "Anamneses" })).toContainText(`Autor Anamnese ${n}`);
  await expect(page.getByRole("region", { name: "Anamneses" })).toContainText("versão 2");
  await page.context().close();
});

test("nova anamnese em andamento acompanha o modelo", async ({ browser }) => {
  const paciente = await admin.from("pacientes").insert({ nome: `Outro ${NOME_PACIENTE}` }).select("id").single();
  const page = await entrar(browser, eu);
  await page.goto(`/anamnese?paciente=${paciente.data!.id}`);
  await expect(page).toHaveURL(/\/anamnese\/[0-9a-f-]{36}/);
  await expect(page.getByLabel("Histórico familiar")).toBeVisible();
  await page.getByLabel("Histórico familiar").fill("Texto em andamento");
  await expect(page.getByRole("status")).toHaveText("Texto guardado");

  await page.getByRole("link", { name: "Editar anamnese" }).click();
  await adicionarPergunta(page, "Pergunta do meio do caminho");
  await page.getByRole("link", { name: "← Voltar" }).click();
  await expect(page.getByLabel("Pergunta do meio do caminho", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Histórico familiar")).toHaveValue("Texto em andamento");
  await page.context().close();
});

test("outro profissional lê as salvas, mas não altera; ninguém apaga", async () => {
  const { data: salvas } = await colega.api.from("anamneses").select("id, conteudo").eq("paciente_id", pacienteId);
  expect(salvas).toHaveLength(1);
  const id = salvas![0].id;
  expect((await colega.api.from("anamneses_versoes").select("versao").eq("anamnese_id", id)).data).toHaveLength(2);

  for (const [funcao, args] of [
    ["guardar_rascunho_anamnese", { p_id: id, p_conteudo: [], p_observacoes: "x" }],
    ["salvar_anamnese", { p_id: id }],
    ["descartar_rascunho_anamnese", { p_id: id }],
  ] as const) {
    expect((await colega.api.rpc(funcao, args)).error?.message, funcao).toContain("Só quem fez");
  }

  // Direto nas tabelas: nem o autor altera ou apaga.
  for (const conta of [eu, colega]) {
    await conta.api.from("anamneses").delete().eq("id", id);
    await conta.api.from("anamneses").update({ observacoes: "Alterado" }).eq("id", id);
    await conta.api.from("anamneses_versoes").delete().eq("anamnese_id", id);
    expect((await conta.api.from("anamneses").insert({ paciente_id: pacienteId, profissional_id: profissionalId })).error).not.toBeNull();
  }
  const depois = await admin.from("anamneses").select("observacoes, versao").eq("id", id).single();
  expect(depois.data).toEqual({ observacoes: "Primeira conversa", versao: 2 });
  expect((await admin.from("anamneses_versoes").select("versao").eq("anamnese_id", id)).data).toHaveLength(2);
});

test("a recepção não vê nada do conteúdo clínico", async ({ browser }) => {
  const { api } = recepcao;
  for (const tabela of ["anamneses", "anamneses_versoes", "anamneses_rascunhos", "anamnese_perguntas"]) {
    const { data, error } = await api.from(tabela).select("*").limit(5);
    expect(error ? [] : data, tabela).toEqual([]);
  }
  expect((await api.rpc("iniciar_anamnese", { p_paciente: pacienteId })).error).not.toBeNull();

  const { data } = await admin.from("anamneses").select("id").eq("paciente_id", pacienteId).limit(1).single();
  const page = await entrar(browser, recepcao);
  await page.goto(`/anamnese/${data!.id}`);
  await expect(page).toHaveURL(/\/agenda/);
  await page.goto(`/pacientes/${pacienteId}`);
  await expect(page.getByRole("heading", { name: NOME_PACIENTE })).toBeVisible();
  await expect(page.getByRole("region", { name: "Anamneses" })).toHaveCount(0);
  await page.context().close();
});

test("sem login, nada responde", async () => {
  const anonimo = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  for (const tabela of ["anamneses", "anamneses_versoes", "anamneses_rascunhos", "anamnese_perguntas"]) {
    const { data, error } = await anonimo.from(tabela).select("*").limit(1);
    expect(error ? [] : data, tabela).toEqual([]);
  }
  expect((await anonimo.rpc("iniciar_anamnese", { p_paciente: pacienteId })).error).not.toBeNull();
});
