import { expect, test } from "@playwright/test";
import { abrirAtendimento, criarAtendimento, painelDetalhes } from "./ajudantes";

test("da agenda para a página do paciente, com o histórico em cards", async ({ page }) => {
  const nome = `Paciente Página ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 2, hora: "12:30" });
  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("link", { name: "Ver página do paciente" }).click();

  await expect(page).toHaveURL(/\/pacientes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nome);
  await expect(page.getByRole("region", { name: "Plano do paciente" })).toContainText("Unimed");
  const card = page.locator("[data-atendimento]");
  await expect(card).toHaveCount(1);

  // O card abre o mesmo painel da agenda (sem o link para a página em que já estamos).
  await card.click();
  await expect(painelDetalhes(page).getByRole("heading", { name: nome })).toBeVisible();
  await expect(painelDetalhes(page).getByRole("link", { name: "Ver página do paciente" })).toHaveCount(0);
  await painelDetalhes(page).getByRole("radio", { name: "Atendido" }).click();
  await expect(painelDetalhes(page).getByRole("radio", { name: "Atendido" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  await expect(card).toContainText("Atendido");
  await expect(page.getByRole("region", { name: "Histórico" })).toContainText("Presença de 100%");
  await page.getByRole("radio", { name: /^Faltas/ }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Nenhum atendimento com esse filtro.")).toBeVisible();
  await page.getByRole("radio", { name: /^Atendidos/ }).click();
  await expect(card).toHaveCount(1);
});

test("lista de pacientes: cadastro rápido, edição da ficha e busca sem acentos", async ({ page }) => {
  const sufixo = Date.now();
  const nome = `Conceição Teste ${sufixo}`;
  await page.goto("/agenda");
  await page.getByRole("navigation").getByRole("link", { name: "Pacientes" }).click();
  await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();

  await page.getByRole("button", { name: "Novo paciente" }).click();
  await page.getByLabel("Nome do novo paciente").fill(nome);
  await page.getByRole("button", { name: "Cadastrar e abrir ficha" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nome);
  await expect(page.getByText("Nenhum atendimento registrado ainda.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Plano do paciente" })).toContainText("Sem plano padrão");

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edicao = page.getByRole("dialog", { name: "Editar paciente" });
  await edicao.getByLabel("Responsável").fill(`Maria ${sufixo}`);
  await edicao.getByLabel("CPF").fill("12345678901");
  await edicao.getByLabel("Plano").selectOption({ label: "Unimed" });
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao).toBeHidden();
  const info = page.getByRole("region", { name: "Informações do paciente" });
  await expect(info).toContainText(`Maria ${sufixo}`);
  await expect(info).toContainText("123.456.789-01");
  await expect(page.getByRole("region", { name: "Plano do paciente" })).toContainText("Unimed");

  // CPF inválido não salva.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await edicao.getByLabel("CPF").fill("123");
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "← Pacientes" }).click();
  await page.getByLabel("Buscar paciente").fill(`conceicao teste ${sufixo}`);
  const resultado = page.getByRole("link", { name: new RegExp(nome) });
  await expect(resultado).toHaveCount(1);
  await expect(resultado).toContainText(`Resp.: Maria ${sufixo}`);
  await page.getByLabel("Buscar paciente").fill(`Maria ${sufixo}`);
  await expect(resultado).toHaveCount(1);
});

test("visão Cadastro: cores por nível, filtro e nível atualizado ao completar o cadastro", async ({ page }) => {
  const nome = `Cadastro Teste ${Date.now()}`;
  await page.goto("/pacientes?visao=cadastro");
  const niveis = page.getByRole("radiogroup", { name: "Nível do cadastro" });
  const lista = page.getByRole("list", { name: "Pacientes por nível do cadastro" });
  await expect(lista.locator('[data-nivel="completo"]').first()).toBeVisible();

  for (const [rotulo, nivel] of [
    ["Crítico", "critico"],
    ["Completo", "completo"],
  ] as const) {
    await niveis.getByRole("radio", { name: new RegExp(`^${rotulo}`) }).click();
    await expect(lista.locator("li").first()).toHaveAttribute("data-nivel", nivel);
    expect(await lista.locator(`li:not([data-nivel="${nivel}"])`).count()).toBe(0);
  }

  // Paciente novo só com o nome: crítico, com tudo o que falta listado.
  await page.getByRole("button", { name: "Novo paciente" }).click();
  await page.getByLabel("Nome do novo paciente").fill(nome);
  await page.getByRole("button", { name: "Cadastrar e abrir ficha" }).click();
  const info = page.getByRole("region", { name: "Informações do paciente" });
  await expect(info).toContainText("Cadastro: crítico");
  await expect(info).toContainText("Falta: responsável, nascimento, CPF, celular, e-mail, endereço, plano");

  // Preenchendo tudo, fica completo.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edicao = page.getByRole("dialog", { name: "Editar paciente" });
  const campos: [string, string][] = [
    ["Responsável", "Maria Teste"],
    ["Nascimento", "2018-05-10"],
    ["CPF", "12345678901"],
    ["Celular", "(49) 99999-0000"],
    ["E-mail", "familia@exemplo.com"],
    ["Endereço", "Rua A, 10"],
    ["Bairro", "Centro"],
    ["Cidade", "Videira"],
    ["UF", "SC"],
    ["CEP", "89560-000"],
  ];
  for (const [rotulo, valor] of campos) await edicao.getByLabel(rotulo, { exact: true }).fill(valor);
  await edicao.getByLabel("Plano").selectOption({ label: "Unimed" });
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao).toBeHidden();
  await expect(info).toContainText("Cadastro: completo");

  await page.goto("/pacientes?visao=cadastro");
  await page.getByLabel("Buscar paciente").fill(nome);
  await expect(lista.locator("li")).toHaveAttribute("data-nivel", "completo");
});
