import { expect, test, type Page } from "@playwright/test";

/** Mês atual + n, como AAAA-MM (fuso da clínica). */
function mes(n: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const d = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

const despesa = (page: Page, nome: string) => page.getByRole("list", { name: "Despesas" }).locator(`[data-despesa="${nome}"]`);

test("despesa recorrente: lança todo mês, exclusão não volta, edição e encerramento só nos meses em aberto", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  const nome = `Internet ${Date.now()}`;

  // Criada no mês passado, dia 31: em mês de 30 dias cai no dia 30.
  await page.goto(`/financeiro/despesas?mes=${mes(-1)}`);
  await page.getByRole("button", { name: "Nova despesa" }).click();
  const form = page.getByRole("form", { name: "Nova despesa" });
  await form.getByLabel("Descrição").fill(nome);
  await form.getByLabel("Valor").fill("100");
  await form.getByLabel("Vencimento").fill(`${mes(-1)}-28`);
  await form.getByRole("checkbox", { name: /Repetir todo mês/ }).check();
  await expect(form.getByRole("checkbox", { name: "Repetir todo mês (dia 28)" })).toBeChecked();
  await form.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(form).toBeHidden();
  await expect(despesa(page, nome)).toContainText("↻ todo mês");

  // Já lançada neste mês e no seguinte (ao abrir).
  for (const m of [mes(0), mes(1)]) {
    await page.goto(`/financeiro/despesas?mes=${m}`);
    await expect(despesa(page, nome)).toContainText(`28/${m.slice(5, 7)}`);
    await expect(despesa(page, nome)).toContainText("R$ 100,00");
  }

  // Excluir o lançamento de um mês: não volta ao reabrir.
  await page.goto(`/financeiro/despesas?mes=${mes(0)}`);
  await despesa(page, nome)
    .getByRole("button", { name: `Excluir ${nome}` })
    .click();
  await expect(despesa(page, nome)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Despesas", exact: true })).toBeVisible();
  await expect(despesa(page, nome)).toHaveCount(0);

  // Editar o modelo: muda os meses em aberto a partir deste; o passado fica.
  const recorrente = page.getByRole("region", { name: "Despesas recorrentes" }).locator(`[data-recorrente="${nome}"]`);
  await expect(recorrente).toContainText("Todo dia 28 · sem data para acabar");
  await recorrente.getByRole("button", { name: "Editar" }).click();
  const edicao = page.getByRole("form", { name: "Editar despesa recorrente" });
  await edicao.getByLabel("Valor").fill("120");
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao).toBeHidden();
  await page.goto(`/financeiro/despesas?mes=${mes(1)}`);
  await expect(despesa(page, nome)).toContainText("R$ 120,00");
  await page.goto(`/financeiro/despesas?mes=${mes(-1)}`);
  await expect(despesa(page, nome)).toContainText("R$ 100,00");

  // Encerrar neste mês: o lançamento do mês seguinte (não pago) sai.
  await page.goto(`/financeiro/despesas?mes=${mes(0)}`);
  await recorrente.getByRole("button", { name: "Encerrar" }).click();
  await expect(recorrente).toContainText("até");
  await page.goto(`/financeiro/despesas?mes=${mes(1)}`);
  await expect(page.getByRole("heading", { name: "Despesas", exact: true })).toBeVisible();
  await expect(despesa(page, nome)).toHaveCount(0);

  // Limpeza do mês passado.
  await page.goto(`/financeiro/despesas?mes=${mes(-1)}`);
  await despesa(page, nome)
    .getByRole("button", { name: `Excluir ${nome}` })
    .click();
  await expect(despesa(page, nome)).toHaveCount(0);
});
