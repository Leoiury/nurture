import { expect, test } from "@playwright/test";
import { cardDoPaciente, criarAtendimento } from "./ajudantes";

// "Hoje" no fuso da clínica, e o índice do dia na semana (0 = segunda).
function hojeNaClinica() {
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const indice = (new Date(`${data}T12:00:00Z`).getUTCDay() + 6) % 7;
  return { data, indice };
}

test("aniversário: bolo na barra com a quantidade e no card do dia", async ({ page }) => {
  const { data, indice } = hojeNaClinica();
  const nome = `Aniversariante ${Date.now()}`;

  // Um atendimento hoje (se for dia útil) para um paciente novo.
  if (indice <= 4) {
    await criarAtendimento(page, { nome, dia: indice, hora: "18:15" });
  } else {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: "Novo paciente" }).click();
    await page.getByLabel("Nome do novo paciente").fill(nome);
    await page.getByRole("button", { name: "Cadastrar e abrir ficha" }).click();
  }

  // Nascido "hoje", dez anos atrás.
  await page.goto("/pacientes");
  await page.getByLabel("Buscar paciente").fill(nome);
  await page.getByRole("link", { name: new RegExp(nome) }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const edicao = page.getByRole("dialog", { name: "Editar paciente" });
  await edicao.getByLabel("Nascimento").fill(`${Number(data.slice(0, 4)) - 10}${data.slice(4)}`);
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(edicao).toBeHidden();

  await page.goto("/agenda");
  const bolo = page.getByRole("button", { name: /^Aniversários:/ });
  await expect(bolo).not.toHaveAttribute("data-quantidade", "0");
  await bolo.click();
  const lista = page.getByRole("dialog", { name: "Próximos aniversários" });
  await expect(lista.getByRole("link", { name: new RegExp(nome) })).toContainText("hoje");
  await expect(lista.getByRole("link", { name: new RegExp(nome) })).toContainText("10 anos");
  await page.keyboard.press("Escape");

  if (indice <= 4) await expect(cardDoPaciente(page, nome).locator("[data-aniversario]")).toHaveCount(1);
});

test("datas comemorativas: cadastro, estrela na barra e no cabeçalho do dia", async ({ page }) => {
  const { data, indice } = hojeNaClinica();
  const nome = `Dia Teste ${Date.now()}`;
  const [, mes, dia] = data.split("-").map(Number);

  await page.goto("/configuracoes/datas");
  const form = page.getByRole("form", { name: "Nova data comemorativa" });
  await form.getByLabel("Nome").fill(nome);
  await form.getByLabel("Dia", { exact: true }).selectOption(String(dia));
  await form.getByLabel("Mês").selectOption(String(mes));
  await form.getByRole("button", { name: "Adicionar" }).click();
  const item = page.getByRole("list", { name: "Datas comemorativas" }).getByRole("listitem").filter({ hasText: nome });
  await expect(item).toContainText(`próxima: ${data.split("-").reverse().join("/")}`);

  // Data móvel: descrição por extenso.
  await form.getByLabel("Nome").fill(`${nome} móvel`);
  await form.getByRole("radio", { name: "Dia da semana" }).click();
  await form.getByLabel("Qual").selectOption("2");
  await form.getByLabel("Dia da semana").selectOption("0");
  await form.getByLabel("Mês").selectOption("5");
  await form.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("list", { name: "Datas comemorativas" })).toContainText("2º domingo de maio");

  await page.goto("/agenda");
  const estrela = page.getByRole("button", { name: /^Datas comemorativas:/ });
  await expect(estrela).not.toHaveAttribute("data-quantidade", "0");
  await estrela.click();
  await expect(page.getByRole("dialog", { name: "Próximas datas comemorativas" })).toContainText(nome);
  await page.keyboard.press("Escape");
  if (indice <= 4) await expect(page.locator(`section[aria-label="${data}"] [data-comemoracao]`).first()).toContainText(nome);

  // Limpa as datas de teste.
  await page.goto("/configuracoes/datas");
  for (const n of [`${nome} móvel`, nome]) {
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `Excluir ${n}` }).click();
    await expect(page.getByRole("button", { name: `Excluir ${n}` })).toHaveCount(0);
  }
});
