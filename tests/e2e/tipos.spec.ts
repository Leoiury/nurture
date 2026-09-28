import { expect, test } from "@playwright/test";
import { abrirPainelNovo, painelNovo } from "./ajudantes";

test("criar tipo com quem atende, usar no atendimento, desativar e excluir", async ({ page }) => {
  const nome = `Tipo Teste ${Date.now()}`;
  await page.goto("/configuracoes/tipos");
  await page.getByRole("button", { name: "+ Novo tipo" }).click();
  const painel = page.getByRole("dialog", { name: "Novo tipo" });
  await painel.getByLabel("Nome").fill(nome);
  await expect(painel).toContainText("qualquer profissional atende");
  await painel.getByRole("checkbox", { name: /Carla Mendes/ }).check();
  await painel.getByRole("button", { name: "Salvar" }).click();
  await expect(painel).toBeHidden();

  const lista = page.getByRole("list", { name: "Tipos de atendimento" });
  const item = lista.getByRole("button", { name: new RegExp(nome) });
  await expect(item).toContainText("Carla M.");
  await expect(lista.getByRole("button", { name: /Reuniões e Visitas/ })).toContainText("Qualquer profissional");

  // Busca de horários com o tipo: só quem atende.
  await abrirPainelNovo(page);
  const form = painelNovo(page);
  await form.getByLabel("Tipo").selectOption({ label: nome });
  const busca = form.getByRole("region", { name: "Horários livres" });
  await busca.getByRole("button", { name: "Buscar horários livres" }).click();
  const sugestoes = busca.getByRole("list", { name: "Sugestões de horário" }).getByRole("button");
  await expect(sugestoes.first()).toBeVisible();
  for (const texto of await sugestoes.allInnerTexts()) expect(texto).toContain("· Carla M.");

  // Profissional que não atende o tipo: só um aviso.
  await form.getByLabel("Profissionais").selectOption({ label: "Bruno Almeida — Fonoaudiólogo" });
  await expect(form).toContainText(`Bruno A. não está entre quem atende “${nome}”.`);
  await page.keyboard.press("Escape");

  // Desativar e depois excluir (sem uso).
  await page.goto("/configuracoes/tipos");
  await item.click();
  const edicao = page.getByRole("dialog", { name: "Editar tipo" });
  await edicao.getByLabel("Ativo").uncheck();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(item).toContainText("inativo");

  await item.click();
  page.once("dialog", (d) => d.accept());
  await edicao.getByRole("button", { name: "Excluir tipo" }).click();
  await expect(item).toHaveCount(0);
});

test("tipo em uso não pode ser excluído, só desativado", async ({ page }) => {
  await page.goto("/configuracoes/tipos");
  await page.getByRole("list", { name: "Tipos de atendimento" }).getByRole("button", { name: /Sessão Psicologia/ }).click();
  const edicao = page.getByRole("dialog", { name: "Editar tipo" });
  await expect(edicao).toContainText("desative em vez de excluir");
  await expect(edicao.getByRole("button", { name: "Excluir tipo" })).toHaveCount(0);
  await expect(edicao.getByRole("checkbox", { name: /Ana Beatriz Costa/ })).toBeChecked();
  await expect(edicao.getByRole("checkbox", { name: /Carla Mendes/ })).not.toBeChecked();
});
