import { expect, test, type Page } from "@playwright/test";
import { abrirAtendimento, cadastrarPacienteNovo, criarAtendimento, diaDaSemanaAtual, painelDetalhes, painelNovo } from "./ajudantes";

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const proximaSegunda = () => somarDias(diaDaSemanaAtual(0), 7);

/** Abre o atendimento do paciente na semana seguinte e devolve o painel de detalhes. */
async function detalhesNaProximaSemana(page: Page, nome: string) {
  await page.goto(`/agenda?semana=${proximaSegunda()}`);
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await abrirAtendimento(page, nome);
  return painelDetalhes(page);
}

async function editarAtendimento(page: Page, nome: string) {
  await page.goto("/agenda");
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("button", { name: "Editar" }).click();
  return page.getByRole("dialog", { name: "Editar atendimento" });
}

test("valor novo nos atendimentos futuros do paciente na mesma área", async ({ page }) => {
  const nome = `Valor Massa ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 0, hora: "11:15", sessoes: 3 });

  const edicao = await editarAtendimento(page, nome);
  await edicao.getByLabel("Valor (R$)").fill("135");
  await edicao.getByRole("button", { name: "Salvar alterações" }).click();
  const confirmar = edicao.getByRole("region", { name: "Confirmar plano e valor" });
  await expect(confirmar).toContainText("Psicologia");
  await confirmar.getByRole("radio", { name: "Sim, todos os futuros atendimentos" }).check();
  await edicao.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(edicao).toBeHidden();

  const detalhes = await detalhesNaProximaSemana(page, nome);
  await expect(detalhes).toContainText("R$ 135,00");
  await expect(detalhes).toContainText("Valor alterado de R$ 120,00 para R$ 135,00 (ajuste em massa do paciente)");
});

test("mudar o plano: padrão do paciente e atendimentos futuros", async ({ page }) => {
  const nome = `Plano Massa ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 0, hora: "11:45", sessoes: 3 });

  const edicao = await editarAtendimento(page, nome);
  await edicao.getByLabel("Plano").selectOption({ label: "Unimed - Reembolso" });
  await expect(edicao.getByLabel("Valor (R$)")).toHaveValue("200");
  await edicao.getByRole("button", { name: "Salvar alterações" }).click();
  const confirmar = edicao.getByRole("region", { name: "Confirmar plano e valor" });
  await confirmar.getByRole("checkbox", { name: /Tornar Unimed - Reembolso o plano padrão/ }).check();
  await confirmar.getByRole("checkbox", { name: /Passar os atendimentos futuros/ }).check();
  await confirmar.getByRole("radio", { name: "Não, apenas este atendimento" }).check();
  await edicao.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(edicao).toBeHidden();

  const detalhes = await detalhesNaProximaSemana(page, nome);
  await expect(detalhes).toContainText("Unimed - Reembolso");
  await expect(detalhes).toContainText("R$ 200,00");
  await expect(detalhes).toContainText("Plano alterado de Unimed para Unimed - Reembolso (mudança de plano do paciente)");
  await expect(detalhes).toContainText("Plano padrãoUnimed - Reembolso");
});

test("reajuste do plano atualiza os atendimentos futuros com o valor antigo", async ({ page }) => {
  const n = Date.now();
  const plano = `Plano Reajuste ${n}`;
  const nome = `Paciente Reajuste ${n}`;

  await page.goto("/configuracoes/planos");
  await page.getByRole("button", { name: "+ Novo plano" }).click();
  const novo = page.getByRole("dialog", { name: "Novo plano" });
  await novo.getByLabel("Nome").fill(plano);
  await novo.getByLabel("Valor padrão (R$)").fill("100");
  await novo.getByRole("button", { name: "Salvar" }).click();
  await expect(novo).toBeHidden();

  // Dois atendimentos na semana que vem com o plano novo (diferente do padrão do paciente).
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await cadastrarPacienteNovo(page, nome);
  const form = painelNovo(page);
  await form.getByLabel("Profissionais").selectOption({ index: 1 });
  await form.getByLabel("Data").fill(proximaSegunda());
  await form.getByLabel("Início").fill("12:45");
  await form.getByLabel("Plano").selectOption({ label: plano });
  await form.getByText("Repetir", { exact: true }).click();
  await form.getByRole("radio", { name: "Toda semana" }).click();
  await form.getByLabel("Número de sessões").fill("2");
  await form.getByRole("button", { name: "Salvar 2 atendimentos" }).click();
  // Plano diferente do padrão do paciente: a confirmação aparece (sem marcar nada).
  await expect(form.getByRole("region", { name: "Confirmar plano e valor" })).toContainText("plano padrão");
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(form).toBeHidden();

  await page.goto("/configuracoes/planos");
  await page.getByRole("list", { name: "Planos" }).getByRole("button", { name: new RegExp(plano) }).click();
  const edicao = page.getByRole("dialog", { name: "Editar plano" });
  await edicao.getByLabel("Valor padrão (R$)").fill("110");
  await expect(edicao.getByRole("checkbox", { name: /Atualizar os atendimentos futuros/ })).toBeChecked();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status")).toContainText("2 atendimentos futuros reajustados");

  const detalhes = await detalhesNaProximaSemana(page, nome);
  await expect(detalhes).toContainText("R$ 110,00");
  await expect(detalhes).toContainText("(reajuste do plano)");
});

test("no planejamento, o ajuste em massa entra no rascunho e é aplicado junto", async ({ page }) => {
  const nome = `Valor Plan ${Date.now()}`;
  await criarAtendimento(page, { nome, dia: 0, hora: "11:30", sessoes: 3 });

  // Rascunho limpo.
  await page.goto("/agenda?planejamento=1");
  const faixa = page.getByRole("region", { name: "Planejamento" });
  const descartar = faixa.getByRole("button", { name: "Descartar" });
  if (await descartar.isEnabled()) {
    page.once("dialog", (d) => d.accept());
    await descartar.click();
    await page.goto("/agenda?planejamento=1");
  }
  await expect(page.locator("[data-altura-medida]")).toBeAttached();

  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("button", { name: "Editar" }).click();
  const edicao = page.getByRole("dialog", { name: "Editar atendimento" });
  await edicao.getByLabel("Valor (R$)").fill("177");
  await edicao.getByRole("button", { name: "Salvar alterações" }).click();
  await edicao.getByRole("radio", { name: "Sim, todos os futuros atendimentos" }).check();
  await edicao.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(edicao).toBeHidden();
  await expect(faixa).toContainText("2 alterações");
  await expect(faixa).not.toContainText("salvando");

  // Nada mudou na agenda real até aplicar.
  const antes = await detalhesNaProximaSemana(page, nome);
  await expect(antes).toContainText("R$ 120,00");

  await page.goto("/agenda?planejamento=1");
  await faixa.getByRole("button", { name: "Revisar e aplicar" }).click();
  const revisao = page.getByRole("dialog", { name: "Revisar planejamento" });
  await expect(revisao).toContainText(`Valor R$ 177,00 nos atendimentos futuros de ${nome} (Psicologia)`);
  await revisao.getByRole("button", { name: "Aplicar 2" }).click();
  await expect(revisao).toBeHidden();

  const depois = await detalhesNaProximaSemana(page, nome);
  await expect(depois).toContainText("R$ 177,00");
});
