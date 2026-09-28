import { expect, test } from "@playwright/test";
import { cadastrarPacienteNovo, painelNovo } from "./ajudantes";

// Usam datas sem atendimentos do seed (fim de 2026 / 2027) para não interferir
// nos outros testes, que rodam em paralelo na semana atual.

test("feriado nacional aparece destacado sem cadastro", async ({ page }) => {
  await page.goto("/agenda?semana=2026-12-21");
  const natal = page.locator('section[aria-label="2026-12-25"]');
  await expect(natal).toContainText("Feriado · Natal");
});

test("cadastrar e remover um feriado municipal", async ({ page }) => {
  const nome = `Feriado Teste ${Date.now()}`;
  await page.goto("/configuracoes/feriados");
  await page.getByRole("radio", { name: "Feriado" }).click();
  await page.getByLabel("Nome").fill(nome);
  await page.getByLabel("Data").fill("2027-03-10");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("status")).toHaveText("Salvo.");
  await expect(page.getByRole("list", { name: "Feriados e recessos cadastrados" })).toContainText(nome);

  await page.goto("/agenda?semana=2027-03-08");
  await expect(page.locator('section[aria-label="2027-03-10"]')).toContainText(nome);

  await page.goto("/configuracoes/feriados");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Remover ${nome}` }).click();
  await expect(page.getByRole("list", { name: "Feriados e recessos cadastrados" })).not.toContainText(nome);
});

test("série pula feriados e mantém o número de sessões", async ({ page }) => {
  await page.goto("/agenda?semana=2026-12-14");
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await cadastrarPacienteNovo(page, `Teste Natal ${Date.now()}`);
  await painelNovo(page).getByLabel("Profissionais").selectOption({ index: 1 });
  await painelNovo(page).getByLabel("Data").fill("2026-12-18");
  await painelNovo(page).getByLabel("Início").fill("10:00");
  await painelNovo(page).getByText("Repetir", { exact: true }).click();
  await painelNovo(page).getByRole("radio", { name: "Toda semana" }).click();
  await painelNovo(page).getByLabel("Número de sessões").fill("3");

  // 25/12 (Natal) e 01/01 (Confraternização) são pulados: 18/12, 08/01 e 15/01.
  const datas = painelNovo(page).getByRole("list", { name: "Datas da série" }).getByRole("listitem");
  await expect(painelNovo(page).getByLabel("Datas puladas")).toContainText("Natal");
  await expect(painelNovo(page).getByLabel("Datas puladas")).toContainText("Confraternização");
  await expect(datas).toHaveCount(3);
  await expect(datas.last()).toContainText("15/01");

  // Desligando a opção, as datas voltam.
  await painelNovo(page).getByText("Pular feriados e recessos").click();
  await expect(datas.nth(1)).toContainText("25/12");
});
