import { expect, test, type Browser, type Page } from "@playwright/test";

async function entrarComo(browser: Browser, email: string, senha: string): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  return page;
}

test("adm cadastra usuário limitado; limitado sem configurações; desativar bloqueia", async ({ page, browser }) => {
  const n = Date.now();
  const nome = `Recepção Teste ${n}`;
  const email = `recepcao.${n}@teste.local`;

  // Adm cadastra (perfil limitado) e recebe a senha provisória.
  await page.goto("/configuracoes/usuarios");
  await page.getByRole("button", { name: "+ Novo usuário" }).click();
  const novo = page.getByRole("dialog", { name: "Novo usuário" });
  await novo.getByLabel("Nome").fill(nome);
  await novo.getByLabel("E-mail (login)").fill(email);
  await novo.getByRole("radio", { name: /^Limitado/ }).check();
  await novo.getByRole("button", { name: "Criar usuário" }).click();
  const aviso = page.getByRole("status", { name: "Senha provisória" });
  await expect(aviso).toContainText(email);
  const senha = (await aviso.locator("[data-senha]").innerText()).trim();
  expect(senha).toHaveLength(12);
  await expect(page.getByRole("list", { name: "Usuários" })).toContainText(nome);

  // O limitado entra: sem configurações, planejamento nem edição de profissionais.
  const limitado = await entrarComo(browser, email, senha);
  await expect(limitado.getByRole("link", { name: "Configurações" })).toHaveCount(0);
  await expect(limitado.getByRole("link", { name: "Planejamento" })).toHaveCount(0);
  await limitado.goto("/configuracoes/planos");
  await expect(limitado.getByText("restritas aos administradores")).toBeVisible();
  await limitado.goto("/agenda?planejamento=1");
  await expect(limitado).not.toHaveURL(/planejamento=1/);
  await limitado.goto("/profissionais");
  await expect(limitado.getByRole("heading", { name: "Profissionais" })).toBeVisible();
  await expect(limitado.getByRole("button", { name: "Novo profissional" })).toHaveCount(0);

  // Troca a própria senha em Minha conta.
  await limitado.goto("/conta");
  await expect(limitado.getByRole("region", { name: "Dados da conta" })).toContainText("Limitado");
  const troca = limitado.getByRole("region", { name: "Trocar senha" });
  await troca.getByLabel("Nova senha", { exact: true }).fill("senha-nova-123");
  await troca.getByLabel("Repita a nova senha").fill("senha-diferente");
  await troca.getByRole("button", { name: "Trocar senha" }).click();
  await expect(troca.getByRole("alert")).toContainText("não são iguais");
  await troca.getByLabel("Nova senha", { exact: true }).fill("senha-nova-123");
  await troca.getByLabel("Repita a nova senha").fill("senha-nova-123");
  await troca.getByRole("button", { name: "Trocar senha" }).click();
  await expect(troca.getByRole("status")).toContainText("Senha trocada");

  // Adm desativa: o limitado perde o acesso.
  await page.getByRole("list", { name: "Usuários" }).getByRole("button", { name: new RegExp(nome) }).click();
  const edicao = page.getByRole("dialog", { name: "Editar usuário" });
  await edicao.getByLabel("Ativo").uncheck();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao).toBeHidden();
  await limitado.goto("/agenda");
  await expect(limitado.getByText("Seu acesso foi desativado")).toBeVisible();
  await limitado.context().close();
});

test("o adm não pode tirar o próprio acesso de administrador", async ({ page }) => {
  await page.goto("/configuracoes/usuarios");
  await page.getByRole("list", { name: "Usuários" }).getByRole("button", { name: /\(você\)/ }).click();
  const edicao = page.getByRole("dialog", { name: "Editar usuário" });
  await edicao.getByRole("radio", { name: /^Limitado/ }).check();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao.getByRole("alert")).toContainText("seu próprio acesso");
});
