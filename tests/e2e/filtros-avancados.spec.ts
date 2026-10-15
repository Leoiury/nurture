import { expect, test } from "@playwright/test";
import { cardDoPaciente, criarAtendimento } from "./ajudantes";

test("filtros avançados: paciente, esmaecer ou esconder e limpar", async ({ page }) => {
  const n = Date.now();
  const ana = `Filtro Ana ${n}`;
  const bia = `Filtro Bia ${n}`;
  await criarAtendimento(page, { nome: ana, dia: 2, hora: "12:00" });
  await criarAtendimento(page, { nome: bia, dia: 2, hora: "12:00", profissional: 2 });

  await page.getByRole("button", { name: "Filtros" }).first().click();
  const menu = page.getByRole("dialog", { name: "Filtros da agenda" });
  await menu.getByRole("button", { name: /Filtros avançados/ }).click();
  await menu.getByRole("button", { name: "Adicionar paciente ao filtro" }).click();
  await menu.getByRole("searchbox", { name: "Pesquisar paciente" }).fill(ana);
  await menu.getByRole("option", { name: ana }).click();
  await expect(menu.getByRole("button", { name: `Tirar ${ana} do filtro` })).toBeVisible();

  // Esmaecer (padrão): o outro paciente fica apagado, mas continua na agenda.
  await expect(cardDoPaciente(page, bia)).toHaveAttribute("data-esmaecido", "");
  await expect(cardDoPaciente(page, ana)).not.toHaveAttribute("data-esmaecido");

  // Esconder: o outro some.
  await menu.getByRole("radio", { name: "Esconder" }).click();
  await expect(cardDoPaciente(page, bia)).toHaveCount(0);
  await expect(cardDoPaciente(page, ana)).toHaveCount(1);

  // Os filtros padrão também estão na aba, e "Limpar filtros" não mexe neles.
  const daniel = menu.getByRole("switch", { name: "Mostrar Daniel Rocha" });
  await daniel.uncheck({ force: true });
  await expect(daniel).not.toBeChecked();
  await menu.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(daniel).not.toBeChecked();
  await daniel.check({ force: true });
  await menu.getByRole("button", { name: `Tirar ${ana} do filtro` }).waitFor({ state: "detached" });
  // De volta ao filtro por paciente, para conferir a barra.
  await menu.getByRole("button", { name: "Adicionar paciente ao filtro" }).click();
  await menu.getByRole("searchbox", { name: "Pesquisar paciente" }).fill(ana);
  await menu.getByRole("option", { name: ana }).click();

  // Indicador na barra e "Limpar filtros".
  await menu.getByRole("button", { name: "Fechar" }).click();
  const ativos = page.getByRole("status", { name: "Filtros ativos" });
  await expect(ativos).toContainText("1 filtro ativo");
  await ativos.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(cardDoPaciente(page, bia)).toHaveCount(1);
  await expect(ativos).toHaveCount(0);

  // Não ficam salvos: ao reabrir a agenda, zerados.
  // O menu reabre na aba em que estava.
  await page.getByRole("button", { name: "Filtros" }).first().click();
  await menu.getByRole("checkbox", { name: "Atendido" }).check();
  await expect(page.getByRole("status", { name: "Filtros ativos" })).toContainText("1 filtro ativo");
  await page.reload();
  await expect(page.getByRole("status", { name: "Filtros ativos" })).toHaveCount(0);
});
