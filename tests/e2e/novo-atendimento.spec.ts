import { expect, test, type Page } from "@playwright/test";

// Criam dados no banco local. Cada teste usa um paciente com nome único, então
// rodar várias vezes (ou em paralelo) não interfere nos outros testes.

/** Dia da semana atual (0 = segunda … 4 = sexta) no fuso da clínica, como AAAA-MM-DD. */
function diaDaSemanaAtual(indice: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + indice);
  return d.toISOString().slice(0, 10);
}

const painel = (page: Page) => page.getByRole("dialog", { name: "Novo atendimento" });

async function abrirPainel(page: Page) {
  await page.goto("/agenda");
  await expect(page.locator("section").first()).toBeVisible();
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(painel(page).getByLabel("Paciente")).toBeVisible();
}

async function cadastrarPacienteNovo(page: Page, nome: string) {
  await painel(page).getByRole("button", { name: "+ Novo" }).click();
  const cadastro = painel(page).getByRole("group", { name: "Novo paciente" });
  await cadastro.getByLabel("Nome do paciente").fill(nome);
  await cadastro.getByLabel("Plano do paciente").selectOption({ label: "Unimed" });
  await cadastro.getByRole("button", { name: "Cadastrar" }).click();
  await expect(cadastro).toBeHidden();
  await expect(painel(page).getByLabel("Paciente")).toHaveValue(nome);
}

test("cria um atendimento avulso com paciente novo e ele aparece na agenda", async ({ page }) => {
  const nome = `Teste Avulso ${Date.now()}`;
  await abrirPainel(page);
  await cadastrarPacienteNovo(page, nome);

  // O plano do paciente preenche duração e valor.
  await expect(painel(page).getByLabel("Plano")).toHaveText(/Unimed/);
  await expect(painel(page).getByLabel("Valor (R$)")).toHaveValue("120");

  await painel(page).getByLabel("Profissionais").selectOption({ index: 1 });
  await painel(page).getByLabel("Data").fill(diaDaSemanaAtual(2));
  await painel(page).getByLabel("Início").fill("12:15");
  await painel(page).getByRole("button", { name: "Salvar", exact: true }).click();

  await expect(painel(page)).toBeHidden();
  await expect(page.locator(`section button[aria-label*="${nome}"]`)).toHaveCount(1);
  await expect(page.locator(`section button[aria-label*="${nome}"]`)).toHaveAttribute("aria-label", /12:15/);
});

test("cria uma série semanal com prévia das datas", async ({ page }) => {
  const nome = `Teste Serie ${Date.now()}`;
  await abrirPainel(page);
  await cadastrarPacienteNovo(page, nome);
  await painel(page).getByLabel("Profissionais").selectOption({ index: 2 });
  await painel(page).getByLabel("Data").fill(diaDaSemanaAtual(1));
  await painel(page).getByLabel("Início").fill("12:00");

  await painel(page).getByText("Repetir", { exact: true }).click();
  await painel(page).getByRole("radio", { name: "Toda semana" }).click();
  await painel(page).getByLabel("Número de sessões").fill("3");
  await expect(painel(page).getByRole("list", { name: "Datas da série" }).getByRole("listitem")).toHaveCount(3);

  await painel(page).getByRole("button", { name: "Salvar 3 atendimentos" }).click();
  await expect(painel(page)).toBeHidden();
  // A primeira sessão cai na semana atual.
  await expect(page.locator(`section button[aria-label*="${nome}"]`)).toHaveCount(1);
});

test("avisa quando o profissional já tem atendimento no horário", async ({ page }) => {
  await abrirPainel(page);
  await cadastrarPacienteNovo(page, `Teste Conflito ${Date.now()}`);
  // O seed cria uma série às quartas 17:15 com o primeiro profissional (ordem alfabética).
  await painel(page).getByLabel("Profissionais").selectOption({ index: 1 });
  await painel(page).getByLabel("Data").fill(diaDaSemanaAtual(2));
  await painel(page).getByLabel("Início").fill("17:15");
  await expect(painel(page).getByText(/já atende/)).toBeVisible();
  // O aviso não impede salvar.
  await expect(painel(page).getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
});
