import { expect, test } from "@playwright/test";
import { cardDoPaciente, criarAtendimento } from "./ajudantes";

test("arrastar o card muda horário e profissional, e dá para desfazer", async ({ page }) => {
  const nome = `Teste Arrastar ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 4, hora: "12:00", profissional: 1 });
  const card = cardDoPaciente(page, nome);
  const rotuloOriginal = (await card.getAttribute("aria-label"))!;
  expect(rotuloOriginal).toMatch(/^12:00/);
  const profissionalOriginal = rotuloOriginal.split(" · ")[2];

  // O card precisa estar na tela para o mouse alcançá-lo (sexta fica abaixo na rolagem).
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // rolagem com encaixe por dia assentar

  const caixa = (await card.boundingBox())!;
  const larguraColuna = (await page.locator("[data-coluna]").first().boundingBox())!.width;
  const umaHora = await page.evaluate(() => {
    const rotulos = [...document.querySelectorAll(".overflow-auto.rounded-3xl section span")].filter((s) => !s.closest("button"));
    const y = (t: string) => rotulos.find((s) => s.textContent === t)!.getBoundingClientRect().top;
    return y("10:00") - y("09:00");
  });

  // Arrasta ~1h para baixo e uma coluna para a direita.
  const x0 = caixa.x + 10;
  const y0 = caixa.y + 6;
  const arrastar = async () => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (larguraColuna * i) / 10, y0 + (umaHora * i) / 10);
    await page.mouse.up();
  };

  // Sem Shift/Ctrl: não move, não abre o card, só explica.
  await arrastar();
  await expect(page.getByRole("status")).toContainText("segure Shift enquanto arrasta");
  await expect(card).toHaveAttribute("aria-label", rotuloOriginal);
  await expect(page.getByRole("dialog", { name: "Detalhes do atendimento" })).toHaveCount(0);

  await page.keyboard.down("Shift");
  await arrastar();
  await page.keyboard.up("Shift");

  const aviso = page.getByRole("status").filter({ hasText: "Movido para" });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText("13:00");
  // Soltar com Shift não conta como Shift + clique na coluna (não abre "novo atendimento").
  await expect(page.getByRole("dialog", { name: "Novo atendimento" })).toHaveCount(0);
  await expect(card).toHaveAttribute("aria-label", /^13:00/);
  // Mudou de coluna: o profissional não é mais o original.
  await expect(card).not.toHaveAttribute("aria-label", new RegExp(` · ${profissionalOriginal} · `));

  // Desfazer volta horário e profissional.
  await aviso.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Movimento desfeito." })).toBeVisible();
  await expect(card).toHaveAttribute("aria-label", rotuloOriginal);
});
