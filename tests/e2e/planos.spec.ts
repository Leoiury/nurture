import { expect, test } from "@playwright/test";
import { abrirPainelNovo, painelNovo } from "./ajudantes";

test("criar plano, usar no atendimento, desativar e excluir", async ({ page }) => {
  const nome = `Plano Teste ${Date.now()}`;
  await page.goto("/configuracoes/planos");
  await page.getByRole("button", { name: "+ Novo plano" }).click();
  const painel = page.getByRole("dialog", { name: "Novo plano" });
  await painel.getByLabel("Nome").fill(nome);
  await painel.getByRole("radio", { name: "Roxo" }).click();
  await painel.getByLabel("Duração em minutos").fill("60");
  await painel.getByLabel("Valor padrão (R$)").fill("95,50");
  await painel.getByLabel("Valor de Psicologia (R$)").fill("130");
  await expect(painel.getByLabel("Prévia do card")).toContainText(nome);
  await painel.getByRole("button", { name: "Salvar" }).click();
  await expect(painel).toBeHidden();

  const lista = page.getByRole("list", { name: "Planos" });
  await expect(lista.getByRole("button", { name: new RegExp(nome) })).toContainText("60 min · R$ 95,50");

  // No formulário de atendimento, o plano sugere duração e valor.
  await abrirPainelNovo(page);
  await painelNovo(page).getByLabel("Plano").selectOption({ label: nome });
  await expect(painelNovo(page).getByLabel("Duração em minutos")).toHaveValue("60");
  await expect(painelNovo(page).getByLabel("Valor (R$)")).toHaveValue("95,5");

  // O tipo escolhe o valor da área; sem valor na área, fica o padrão.
  await painelNovo(page).getByLabel("Tipo").selectOption({ label: "Sessão Psicologia" });
  await expect(painelNovo(page).getByLabel("Valor (R$)")).toHaveValue("130");
  await painelNovo(page).getByLabel("Tipo").selectOption({ label: "Sessão Fonoaudiologia" });
  await expect(painelNovo(page).getByLabel("Valor (R$)")).toHaveValue("95,5");
  // Valor digitado à mão não é trocado pelo tipo.
  await painelNovo(page).getByLabel("Valor (R$)").fill("210");
  await painelNovo(page).getByLabel("Tipo").selectOption({ label: "Sessão Psicologia" });
  await expect(painelNovo(page).getByLabel("Valor (R$)")).toHaveValue("210");
  await page.keyboard.press("Escape");

  // Desativar e depois excluir (sem uso).
  await page.goto("/configuracoes/planos");
  await lista.getByRole("button", { name: new RegExp(nome) }).click();
  const edicao = page.getByRole("dialog", { name: "Editar plano" });
  await edicao.getByLabel("Ativo").uncheck();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(lista.getByRole("button", { name: new RegExp(nome) })).toContainText("inativo");

  await lista.getByRole("button", { name: new RegExp(nome) }).click();
  page.once("dialog", (d) => d.accept());
  await edicao.getByRole("button", { name: "Excluir plano" }).click();
  await expect(lista.getByRole("button", { name: new RegExp(nome) })).toHaveCount(0);
});

test("plano em uso não pode ser excluído, só desativado", async ({ page }) => {
  await page.goto("/configuracoes/planos");
  await page.getByRole("list", { name: "Planos" }).getByRole("button", { name: /^Unimed\b(?! -)/ }).click();
  const edicao = page.getByRole("dialog", { name: "Editar plano" });
  await expect(edicao).toContainText("desative em vez de excluir");
  await expect(edicao.getByRole("button", { name: "Excluir plano" })).toHaveCount(0);
});

test("configurações têm abas de planos e feriados", async ({ page }) => {
  await page.goto("/configuracoes");
  await expect(page).toHaveURL(/\/configuracoes\/planos$/);
  await page.getByRole("link", { name: "Feriados e recessos" }).click();
  await expect(page).toHaveURL(/\/configuracoes\/feriados$/);
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
});
