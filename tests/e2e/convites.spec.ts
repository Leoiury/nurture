import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Convite: um link por profissional para ele criar o próprio login, já vinculado.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SENHA = "senha-do-convite-123";
const logins: string[] = [];
let contador = 0;

async function novoProfissional() {
  const nome = `Dra. Convite ${++contador} ${n}`;
  const { data } = await admin.from("profissionais").insert({ nome }).select("id").single();
  return { id: data!.id as string, nome };
}

async function gerarLink(page: Page, nome: string) {
  await page.goto("/configuracoes/usuarios");
  const linha = page.getByRole("listitem", { name: nome, exact: true });
  await linha.getByRole("button", { name: /Gerar (outro )?link/ }).click();
  const mensagem = await linha.getByRole("textbox", { name: "Mensagem" }).inputValue();
  expect(mensagem).toContain(nome);
  expect(mensagem).toContain("uma única vez");
  return mensagem.match(/https?:\/\/\S+\/cadastro\/\S+/)![0];
}

const hashDoLink = (link: string) => createHash("sha256").update(link.split("/").pop()!).digest("hex");

async function abrirSemLogin(browser: Browser, link: string) {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const pagina = await contexto.newPage();
  await pagina.goto(link);
  return pagina;
}

async function preencher(pagina: Page, email: string, senha = SENHA, confirmacao = senha) {
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha", { exact: true }).fill(senha);
  await pagina.getByLabel("Repita a senha").fill(confirmacao);
  await pagina.getByRole("button", { name: "Criar meu acesso" }).click();
}

async function guardarLogin(email: string) {
  const { data } = await admin.from("usuarios").select("id").eq("email", email).single();
  logins.push(data!.id);
  return data!.id as string;
}

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
});

test("o link guia o profissional e cria o login já vinculado, uma única vez", async ({ browser, page }) => {
  const prof = await novoProfissional();
  const link = await gerarLink(page, prof.nome);
  // Só o hash fica no banco.
  const { data: guardado } = await admin.from("convites").select("token_hash, usado_em").eq("profissional_id", prof.id).single();
  expect(guardado!.token_hash).toBe(hashDoLink(link));
  expect(link).not.toContain(guardado!.token_hash);

  const pagina = await abrirSemLogin(browser, link);
  await expect(pagina).toHaveURL(link);
  await expect(pagina.getByText(prof.nome)).toBeVisible();
  // Abrir o link não o gasta: pré-visualização de mensagem não estraga o convite.
  await pagina.reload();
  await pagina.getByRole("button", { name: "Sou eu, continuar" }).click();

  // Erros de digitação não gastam o link.
  const email = `convite.${n}@teste.local`;
  await preencher(pagina, email, SENHA, "outra-senha-123");
  await expect(pagina.getByRole("alert").filter({ hasText: "não são iguais" })).toBeVisible();
  expect((await admin.from("convites").select("usado_em").eq("profissional_id", prof.id).single()).data!.usado_em).toBeNull();

  await preencher(pagina, email);
  await expect(pagina).toHaveURL(/\/agenda/);
  const usuarioId = await guardarLogin(email);

  const { data: usuario } = await admin.from("usuarios").select("perfil, profissional_id, nome").eq("id", usuarioId).single();
  expect(usuario).toEqual({ perfil: "profissional", profissional_id: prof.id, nome: prof.nome });
  const { data: convite } = await admin.from("convites").select("usado_em, usuario_id").eq("profissional_id", prof.id).single();
  expect(convite!.usado_em).not.toBeNull();
  expect(convite!.usuario_id).toBe(usuarioId);
  expect((await admin.from("profissionais").select("email").eq("id", prof.id).single()).data!.email).toBe(email);
  await pagina.context().close();

  // O link não vale de novo.
  const depois = await abrirSemLogin(browser, link);
  await expect(depois.getByRole("alert").filter({ hasText: "não vale mais" })).toBeVisible();
  await expect(depois.getByRole("button", { name: "Sou eu, continuar" })).toHaveCount(0);
  await depois.context().close();

  // Com login, o profissional sai da lista de convites.
  await page.goto("/configuracoes/usuarios");
  await expect(page.getByRole("listitem", { name: prof.nome, exact: true })).toHaveCount(0);
});

test("e-mail já usado devolve o link, para tentar de novo com outro", async ({ browser, page }) => {
  const prof = await novoProfissional();
  const link = await gerarLink(page, prof.nome);
  const emailExistente = `existente.${n}@teste.local`;
  const criado = await admin.auth.admin.createUser({ email: emailExistente, password: SENHA, email_confirm: true });
  logins.push(criado.data.user!.id);

  const pagina = await abrirSemLogin(browser, link);
  await pagina.getByRole("button", { name: "Sou eu, continuar" }).click();
  await preencher(pagina, emailExistente);
  await expect(pagina.getByRole("alert").filter({ hasText: "Já existe um login" })).toBeVisible();
  expect((await admin.from("convites").select("usado_em").eq("profissional_id", prof.id).single()).data!.usado_em).toBeNull();

  const email = `convite2.${n}@teste.local`;
  await preencher(pagina, email);
  await expect(pagina).toHaveURL(/\/agenda/);
  await guardarLogin(email);
  await pagina.context().close();
});

test("link vencido, cancelado, trocado ou inventado não abre", async ({ browser, page }) => {
  const prof = await novoProfissional();
  const naoVale = async (link: string) => {
    const pagina = await abrirSemLogin(browser, link);
    await expect(pagina.getByRole("alert").filter({ hasText: "não vale mais" })).toBeVisible();
    await pagina.context().close();
  };

  // Gerar outro invalida o anterior.
  const primeiro = await gerarLink(page, prof.nome);
  const segundo = await gerarLink(page, prof.nome);
  await naoVale(primeiro);

  // Vencido.
  await admin.from("convites").update({ expira_em: "2020-01-01T00:00:00Z" }).eq("token_hash", hashDoLink(segundo));
  await naoVale(segundo);
  await admin.from("convites").update({ expira_em: "2099-01-01T00:00:00Z" }).eq("token_hash", hashDoLink(segundo));

  // Cancelado pelo ADM.
  await page.goto("/configuracoes/usuarios");
  const linha = page.getByRole("listitem", { name: prof.nome, exact: true });
  await linha.getByRole("button", { name: "Cancelar link" }).click();
  await expect(linha.getByRole("button", { name: "Gerar link", exact: true })).toBeVisible();
  await naoVale(segundo);

  // Inventado, e nada de ir para o login.
  await naoVale(new URL("/cadastro/token-inventado", segundo).href);
  await naoVale(new URL(`/cadastro/${"a".repeat(43)}`, segundo).href);
});

test("só ADM gera link, e quem não é ADM não lê os convites", async ({ browser, page }) => {
  const prof = await novoProfissional();
  await gerarLink(page, prof.nome);

  const email = `limitado.${n}@teste.local`;
  const criado = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  logins.push(criado.data.user!.id);
  const api = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await api.auth.signInWithPassword({ email, password: SENHA });
  expect((await api.from("convites").select("id")).data).toEqual([]);
  expect((await api.from("convites").insert({ profissional_id: prof.id, token_hash: `x${n}`, expira_em: "2099-01-01T00:00:00Z" })).error).not.toBeNull();

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pagina = await contexto.newPage();
  await pagina.goto("/login?manual");
  await pagina.getByLabel("E-mail").fill(email);
  await pagina.getByLabel("Senha").fill(SENHA);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).toHaveURL(/\/agenda/);
  await pagina.goto("/configuracoes/usuarios");
  await expect(pagina.getByRole("region", { name: "Convites para profissionais" })).toHaveCount(0);
  await contexto.close();
});
