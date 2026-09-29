import { expect, test } from "@playwright/test";
import { cardDoPaciente, criarAtendimento, horarioLivre, painelNovo, tocar } from "./ajudantes";

// Telas de toque: marcar e mover exigem segurar o dedo (toques simulados com PointerEvent).

test("toque rápido num horário vazio não marca; segurando, abre o formulário", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  const { x, y, hora } = await horarioLivre(page);

  await tocar(page, x, y, 80);
  await page.waitForTimeout(600);
  await expect(painelNovo(page)).toHaveCount(0);

  await tocar(page, x, y, 700);
  await expect(painelNovo(page).getByLabel("Início")).toHaveValue(hora);
});

test("segurar o card e arrastar com o dedo muda o horário", async ({ page }) => {
  const nome = `Teste Toque ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 3, hora: "12:30", profissional: 1 });
  const card = cardDoPaciente(page, nome);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const caixa = (await card.boundingBox())!;
  const umaHora = await page.evaluate(() => {
    const rotulos = [...document.querySelectorAll(".overflow-auto.rounded-3xl section span")].filter((s) => !s.closest("button"));
    const y = (t: string) => rotulos.find((s) => s.textContent === t)!.getBoundingClientRect().top;
    return y("10:00") - y("09:00");
  });
  const seletor = `[data-atendimento="${await card.getAttribute("data-atendimento")}"]`;
  const x0 = caixa.x + 10;
  const y0 = caixa.y + 6;

  // Deslizar logo de cara é rolagem: o card não muda.
  await tocar(page, x0, y0, 50, { x: x0, y: y0 + umaHora }, seletor);
  await expect(card).toHaveAttribute("aria-label", /^12:30/);

  await tocar(page, x0, y0, 700, { x: x0, y: y0 + umaHora }, seletor);
  const aviso = page.getByRole("status").filter({ hasText: "Movido para" });
  await expect(aviso).toContainText("13:30");
  await expect(card).toHaveAttribute("aria-label", /^13:30/);
  await aviso.getByRole("button", { name: "Desfazer" }).click();
  await expect(card).toHaveAttribute("aria-label", /^12:30/);
});
