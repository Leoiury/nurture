import { expect, test, type Page } from "@playwright/test";
import { cadastrarPacienteNovo, cardDoPaciente, criarAtendimento, diaDaSemanaAtual, painelNovo } from "./ajudantes";

// O rascunho do planejamento é único: estes testes rodam em sequência.
test.describe.configure({ mode: "serial" });

const faixa = (page: Page) => page.getByRole("region", { name: "Planejamento" });

async function abrirPlanejamento(page: Page) {
  await page.goto("/agenda?planejamento=1");
  await expect(faixa(page)).toBeVisible();
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
}

/** Começa sem rascunho (execuções anteriores podem ter deixado um). */
async function descartarSeHouver(page: Page) {
  await abrirPlanejamento(page);
  const descartar = faixa(page).getByRole("button", { name: "Descartar" });
  if (await descartar.isEnabled()) {
    page.once("dialog", (d) => d.accept());
    await descartar.click();
    await expect(page).not.toHaveURL(/planejamento=1/);
  }
}

/**
 * Arrasta o card (com Shift) `horas` para baixo. Os eventos são disparados no próprio
 * card: execuções anteriores deixam cards no mesmo horário, que podem cobri-lo.
 * (O arraste com o mouse de verdade é coberto por arrastar.spec.ts.)
 */
async function arrastarParaBaixo(page: Page, nome: string, horas: number) {
  const card = cardDoPaciente(page, nome);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const id = await card.getAttribute("data-atendimento");
  await page.evaluate(
    async ({ id, horas }) => {
      const rotulos = [...document.querySelectorAll(".overflow-auto.rounded-3xl section span")].filter((s) => !s.closest("button"));
      const y = (t: string) => rotulos.find((s) => s.textContent === t)!.getBoundingClientRect().top;
      const umaHora = y("10:00") - y("09:00");
      const el = document.querySelector(`[data-atendimento="${id}"]`)!;
      const caixa = el.getBoundingClientRect();
      const [x0, y0] = [caixa.x + 10, caixa.y + 6];
      const base = { bubbles: true, cancelable: true, pointerType: "mouse", button: 0, shiftKey: true, pointerId: 1, isPrimary: true };
      el.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: x0, clientY: y0 }));
      for (let i = 1; i <= 8; i++) {
        window.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: x0, clientY: y0 + (umaHora * horas * i) / 8 }));
        await new Promise((r) => setTimeout(r, 20));
      }
      window.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: x0, clientY: y0 + umaHora * horas }));
    },
    { id, horas },
  );
}

async function esperarSalvar(page: Page) {
  await expect(faixa(page)).not.toContainText("salvando");
}

test("planejar, conferir que a agenda real não muda, e aplicar", async ({ page }) => {
  const sufixo = Date.now();
  const existente = `Plan Existente ${sufixo}`;
  const novo = `Plan Novo ${sufixo}`;
  await criarAtendimento(page, { nome: existente, dia: 1, hora: "16:30" });
  await descartarSeHouver(page);

  // Entrar pelo botão da agenda.
  await page.goto("/agenda");
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await page.getByRole("link", { name: "Planejamento" }).click();
  await expect(page).toHaveURL(/planejamento=1/);
  await expect(faixa(page)).toContainText("Nenhuma alteração");

  // Mover o existente 1h para baixo.
  await arrastarParaBaixo(page, existente, 1);
  await expect(page.getByRole("status")).toContainText("Movido no planejamento");
  await expect(cardDoPaciente(page, existente)).toHaveAttribute("aria-label", /^17:30/);
  await expect(cardDoPaciente(page, existente)).toHaveAttribute("data-rascunho", "alterado");

  // Criar um novo (o paciente é cadastrado de verdade; o atendimento só no rascunho).
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(painelNovo(page)).toContainText("No planejamento");
  await cadastrarPacienteNovo(page, novo);
  await painelNovo(page).getByLabel("Profissionais").selectOption({ index: 1 });
  await painelNovo(page).getByLabel("Data").fill(diaDaSemanaAtual(1));
  await painelNovo(page).getByLabel("Início").fill("15:15");
  await painelNovo(page).getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(painelNovo(page)).toBeHidden();
  await expect(cardDoPaciente(page, novo)).toHaveAttribute("data-rascunho", "novo");
  await expect(faixa(page)).toContainText("2 alterações");
  await esperarSalvar(page);

  // A agenda real não mudou.
  await faixa(page).getByRole("link", { name: "Sair" }).click();
  await expect(faixa(page)).toHaveCount(0);
  await expect(cardDoPaciente(page, existente)).toHaveAttribute("aria-label", /^16:30/);
  await expect(cardDoPaciente(page, novo)).toHaveCount(0);

  // O rascunho continua salvo.
  await abrirPlanejamento(page);
  await expect(faixa(page)).toContainText("2 alterações");
  await expect(cardDoPaciente(page, existente)).toHaveAttribute("aria-label", /^17:30/);

  // Revisar e aplicar.
  await faixa(page).getByRole("button", { name: "Revisar e aplicar" }).click();
  const revisao = page.getByRole("dialog", { name: "Revisar planejamento" });
  await expect(revisao.getByRole("list", { name: "Alterações do planejamento" }).getByRole("listitem")).toHaveCount(2);
  await expect(revisao).toContainText(`Mover ${existente}`);
  await expect(revisao).toContainText(`Novo: ${novo}`);
  await revisao.getByRole("button", { name: "Aplicar 2" }).click();
  await expect(revisao).toBeHidden();
  await expect(page.getByRole("status")).toContainText("2 alterações aplicadas");
  await expect(faixa(page)).toContainText("Nenhuma alteração");

  // Agora está na agenda real.
  await page.goto("/agenda");
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await expect(cardDoPaciente(page, existente)).toHaveAttribute("aria-label", /^17:30/);
  await expect(cardDoPaciente(page, novo)).toHaveAttribute("aria-label", /^15:15/);
  await expect(cardDoPaciente(page, novo)).not.toHaveAttribute("data-rascunho");
});

test("se a agenda real mudou, nada é aplicado e a alteração em conflito é apontada", async ({ page }) => {
  const nome = `Plan Conflito ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 1, hora: "17:45" });
  await descartarSeHouver(page);

  // No planejamento: desmarcar.
  await abrirPlanejamento(page);
  await cardDoPaciente(page, nome).dispatchEvent("click");
  const detalhes = page.getByRole("dialog", { name: "Detalhes do atendimento" });
  await detalhes.getByRole("button", { name: "Desmarcar" }).click();
  await detalhes.getByRole("radio", { name: "Paciente desmarcou" }).click();
  await detalhes.getByRole("button", { name: "Confirmar desmarcação" }).click();
  await expect(detalhes).toBeHidden();
  await expect(faixa(page)).toContainText("1 alteração");
  await esperarSalvar(page);

  // Na agenda real, alguém move o mesmo atendimento.
  await page.goto("/agenda");
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await arrastarParaBaixo(page, nome, -1);
  await expect(page.getByRole("status")).toContainText("Movido para");

  // Aplicar: conflito, nada muda.
  await abrirPlanejamento(page);
  await faixa(page).getByRole("button", { name: "Revisar e aplicar" }).click();
  const revisao = page.getByRole("dialog", { name: "Revisar planejamento" });
  await revisao.getByRole("button", { name: "Aplicar 1" }).click();
  await expect(revisao.getByRole("alert")).toContainText("Nada foi aplicado");
  await expect(revisao).toContainText("A agenda real mudou");

  // Descartar o rascunho; o atendimento continua marcado na agenda real.
  await revisao.getByRole("button", { name: "Cancelar" }).click();
  page.once("dialog", (d) => d.accept());
  await faixa(page).getByRole("button", { name: "Descartar" }).click();
  await expect(page).not.toHaveURL(/planejamento=1/);
  await expect(cardDoPaciente(page, nome)).toHaveAttribute("aria-label", /marcado$/);
});
