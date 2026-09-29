import { expect, test } from "@playwright/test";

test("lista de profissionais e ficha com tipos, números e próximos atendimentos", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("navigation").getByRole("link", { name: "Profissionais" }).click();
  await expect(page.getByRole("heading", { name: "Profissionais" })).toBeVisible();
  await page.getByRole("list", { name: "Profissionais" }).getByRole("link", { name: /Ana Beatriz Costa/ }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ana Beatriz Costa");
  await expect(page.getByRole("region", { name: "Tipos que atende" })).toContainText("Sessão Psicologia");
  await expect(page.getByRole("region", { name: "Números da agenda" })).toContainText("Esta semana");
  await expect(page.getByRole("region", { name: "Próximos atendimentos" }).getByRole("link").first()).toBeVisible();
});

test("cadastrar e editar um profissional", async ({ page }) => {
  const nome = `Profissional Teste ${Date.now()}`;
  await page.goto("/profissionais");
  await page.getByRole("button", { name: "Novo profissional" }).click();
  const novo = page.getByRole("dialog", { name: "Novo profissional" });
  await novo.getByLabel("Nome").fill(nome);
  await novo.getByLabel("Especialidade").fill("Terapeuta Ocupacional");
  await novo.getByRole("button", { name: "Salvar" }).click();

  // Vai para a ficha do novo profissional.
  await expect(page).toHaveURL(/\/profissionais\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nome);
  await expect(page.getByRole("region", { name: "Próximos atendimentos" })).toContainText("Nenhum atendimento marcado");

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edicao = page.getByRole("dialog", { name: "Editar profissional" });
  await edicao.getByLabel("Registro no conselho").fill("CREFITO 10/123456");
  await edicao.getByLabel("Celular").fill("(49) 98888-1111");
  await edicao.getByLabel("E-mail").fill("email-invalido");
  await edicao.getByRole("button", { name: "Salvar" }).click();
  // O próprio navegador barra o e-mail inválido: o painel continua aberto.
  expect(await edicao.getByLabel("E-mail").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await expect(edicao).toBeVisible();
  await edicao.getByLabel("E-mail").fill("to@exemplo.com");
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao).toBeHidden();

  const info = page.getByRole("region", { name: "Informações do profissional" });
  await expect(info).toContainText("CREFITO 10/123456");
  await expect(info).toContainText("(49) 98888-1111");
  await expect(info).toContainText("to@exemplo.com");
});
