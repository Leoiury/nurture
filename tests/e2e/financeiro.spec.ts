import { expect, test } from "@playwright/test";
import { abrirAtendimento, criarAtendimento, diaDaSemanaAtual, painelDetalhes } from "./ajudantes";

test("financeiro: realizado aparece a receber, pagamento quita e entra no extrato; despesa paga sai", async ({ page }) => {
  const n = Date.now();
  const nome = `Fin Paciente ${n}`;
  const dia = diaDaSemanaAtual(1); // terça (a segunda 12/10 é feriado)
  const mes = dia.slice(0, 7);

  // Atendimento realizado (Unimed, Psicologia: R$ 120,00).
  await criarAtendimento(page, { nome, dia: 1, hora: "12:45" });
  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("radio", { name: "Atendido" }).click();
  await expect(painelDetalhes(page).getByRole("radio", { name: "Atendido" })).toHaveAttribute("aria-checked", "true");

  // Painel: aba no menu principal e card principal com as três partes.
  await page.goto("/agenda");
  await page.getByRole("link", { name: "Financeiro" }).click();
  await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
  await page.goto(`/financeiro?mes=${mes}`);
  const resumo = page.getByRole("region", { name: "Resumo do mês" });
  await expect(resumo).toContainText("Esperado no mês");
  await expect(resumo).toContainText("Realizados");
  await expect(resumo).toContainText("Recebido");

  // Realizados → lista de atendimentos com o filtro de status.
  await page.locator("[data-card=realizados]").click();
  await expect(page).toHaveURL(/\/financeiro\/atendimentos\?mes=.*status=atendido/);
  await expect(page.getByRole("radio", { name: "Realizados" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Buscar paciente").fill(nome);
  await expect(page.getByRole("row", { name: new RegExp(nome) })).toContainText("R$ 120,00");
  await expect(page.getByRole("status", { name: "Totais" })).toContainText("A receber:R$ 120,00");

  // A receber por plano → mesma lista, agrupada por plano e só em aberto.
  await page.goto(`/financeiro?mes=${mes}`);
  await page.locator("[data-card=a-receber]").click();
  await expect(page.getByLabel("Agrupar")).toHaveValue("plano");
  await expect(page.getByLabel("Pagamento")).toHaveValue("aberto");
  await expect(page.locator("[data-grupo=Unimed]")).toBeVisible();

  // Não pagos → pagamentos; registrar o pagamento do paciente quita o atendimento.
  await page.goto(`/financeiro?mes=${mes}`);
  await page.locator("[data-card=nao-pagos]").click();
  await expect(page).toHaveURL(/aba=nao-pagos/);
  const linha = page.locator(`[data-paciente="${nome}"]`);
  await linha.getByRole("button", { name: "Registrar pagamento" }).click();
  const form = page.getByRole("form", { name: "Registrar pagamento" });
  await expect(form.getByRole("checkbox", { name: new RegExp(nome) })).toBeChecked();
  await expect(form.getByLabel("Valor recebido")).toHaveValue("120,00");
  await form.getByLabel("Observação").fill(`teste ${n}`);
  await form.getByRole("button", { name: "Salvar pagamento" }).click();
  await expect(form).toBeHidden();
  await expect(linha).toHaveCount(0);

  await page.getByRole("link", { name: "Registrados" }).click();
  const registrados = page.getByRole("list", {
    name: "Pagamentos registrados",
  });
  await expect(registrados.getByRole("listitem").filter({ hasText: nome })).toContainText("quita 1 atendimento");

  // Despesa paga.
  await page.goto(`/financeiro/despesas?mes=${mes}`);
  await page.getByRole("button", { name: "Nova despesa" }).click();
  const despesa = page.getByRole("form", { name: "Nova despesa" });
  await despesa.getByLabel("Descrição").fill(`Aluguel teste ${n}`);
  await despesa.getByLabel("Categoria").fill("Aluguel");
  await despesa.getByLabel("Valor").fill("1.500,00");
  await despesa.getByLabel("Vencimento").fill(dia);
  await despesa.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(despesa).toBeHidden();
  const item = page.locator(`[data-despesa="Aluguel teste ${n}"]`);
  await expect(item).toContainText("R$ 1.500,00");
  await item.getByRole("button", { name: "Marcar como paga" }).click();
  await expect(item.getByRole("button", { name: /Paga em/ })).toBeVisible();

  // Extrato: a entrada e a saída. Recebido → extrato.
  await page.goto(`/financeiro?mes=${mes}`);
  await page.locator("[data-card=recebido]").click();
  await expect(page).toHaveURL(/\/financeiro\/extrato/);
  await expect(page.locator("tr[data-tipo=entrada]").filter({ hasText: nome })).toContainText("+ R$ 120,00");
  // A despesa sai na data em que foi paga (hoje), que pode ser em outro mês.
  if (new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7) === mes) {
    await expect(page.locator("tr[data-tipo=saida]").filter({ hasText: `Aluguel teste ${n}` })).toContainText("R$ 1.500,00");
  }

  // Limpeza: excluir o pagamento devolve o atendimento para "em aberto".
  page.on("dialog", (d) => void d.accept());
  await page.goto(`/financeiro/pagamentos?mes=${mes}`);
  await page
    .getByRole("listitem")
    .filter({ hasText: nome })
    .getByRole("button", { name: /Excluir pagamento/ })
    .click();
  await expect(page.getByRole("listitem").filter({ hasText: nome })).toHaveCount(0);
  await page.goto(`/financeiro/pagamentos?mes=${mes}&aba=nao-pagos`);
  await expect(page.locator(`[data-paciente="${nome}"]`)).toContainText("R$ 120,00");
  await page.goto(`/financeiro/despesas?mes=${mes}`);
  await page.getByRole("button", { name: `Excluir Aluguel teste ${n}` }).click();
  await expect(page.locator(`[data-despesa="Aluguel teste ${n}"]`)).toHaveCount(0);
});

test("financeiro em lote: seleciona vários, um pagamento quita todos, baixa (glosa) e revisão ao desmarcar um pago", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  const n = Date.now();
  const [ana, bia, caio] = ["A", "B", "C"].map((l) => `Lote ${n} ${l}`);
  for (const [i, nome] of [ana, bia, caio].entries()) {
    await criarAtendimento(page, { nome, dia: 1, hora: ["13:00", "13:45", "14:30"][i] });
    await abrirAtendimento(page, nome);
    await painelDetalhes(page).getByRole("radio", { name: "Atendido" }).click();
    await expect(painelDetalhes(page).getByRole("radio", { name: "Atendido" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
  }

  // Em aberto de todos os meses: busca e seleciona os dois primeiros; um pagamento (Unimed) quita os dois.
  await page.goto("/financeiro/atendimentos?periodo=aberto");
  await expect(page.getByRole("heading", { name: "Em aberto de todos os meses" })).toBeVisible();
  await page.getByLabel("Buscar paciente").fill(`Lote ${n}`);
  await expect(page.getByRole("row", { name: new RegExp(caio) })).toBeVisible();
  await page.getByRole("checkbox", { name: "Selecionar todos em aberto" }).check();
  await page.getByRole("checkbox", { name: new RegExp(`Selecionar .* ${caio}`) }).uncheck();
  const selecao = page.getByRole("region", { name: "Seleção" });
  await expect(selecao).toContainText("2 selecionados · R$ 240,00 a receber");
  await selecao.getByRole("button", { name: "Registrar pagamento" }).click();
  const form = page.getByRole("form", { name: "Registrar pagamento" });
  await expect(form.getByRole("radio", { name: "Plano / convênio" })).toHaveAttribute("aria-checked", "true");
  await expect(form.getByLabel("Plano")).toHaveValue(/.+/);
  await expect(form.getByLabel("Valor recebido")).toHaveValue("240,00");
  await form.getByLabel("Observação").fill(`lote ${n}`);
  await form.getByRole("button", { name: "Salvar pagamento" }).click();
  await expect(form).toBeHidden();
  // Quitados, saem do "em aberto".
  await expect(page.getByRole("row", { name: new RegExp(ana) })).toHaveCount(0);
  await expect(page.getByRole("row", { name: new RegExp(bia) })).toHaveCount(0);

  // Baixa (glosa) de R$ 20 no terceiro: fica R$ 100 em aberto.
  await page.getByRole("checkbox", { name: new RegExp(`Selecionar .* ${caio}`) }).check();
  await page.getByRole("region", { name: "Seleção" }).getByRole("button", { name: "Dar baixa no saldo" }).click();
  const baixa = page.getByRole("form", { name: "Dar baixa no saldo" });
  await baixa.getByLabel(new RegExp(`Baixa em .* ${caio}`)).fill("20");
  await baixa.getByRole("button", { name: "Dar baixa de R$ 20,00" }).click();
  await expect(baixa).toBeHidden();
  const linhaCaio = page.getByRole("row", { name: new RegExp(caio) });
  await expect(linhaCaio).toContainText("baixa R$ 20,00");
  await expect(linhaCaio).toContainText("R$ 100,00");

  // Na agenda, o atendimento pago mostra a situação e avisa ao desmarcar.
  await page.goto("/agenda");
  await abrirAtendimento(page, ana);
  const painel = painelDetalhes(page);
  await expect(painel).toContainText("Pago");
  await painel.getByRole("button", { name: "Desmarcar" }).click();
  await expect(painel.getByRole("note")).toContainText("já tem R$ 120,00 pago");
  await painel.getByRole("radio", { name: "Paciente desmarcou" }).click();
  await painel.getByRole("button", { name: "Confirmar desmarcação" }).click();
  await expect(painel.getByRole("status")).toHaveText("Atendimento desmarcado.");

  // A revisar: desvincular deixa o valor como crédito sem vínculo no pagamento.
  await page.goto("/financeiro");
  await expect(page.getByRole("alert").filter({ hasText: "Revisar" })).toBeVisible();
  await page.goto(`/financeiro/pagamentos?mes=${diaDaSemanaAtual(1).slice(0, 7)}&aba=revisar`);
  const item = page.locator(`[data-revisar="${ana}"]`);
  await expect(item).toContainText("não está mais como realizado");
  await item.getByRole("button", { name: "Desvincular" }).click();
  await expect(item).toHaveCount(0);

  // Limpeza: excluir o pagamento e desfazer a baixa.
  const hojeMes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
  await page.goto(`/financeiro/pagamentos?mes=${hojeMes}`);
  const pagamento = page.getByRole("listitem").filter({ hasText: `lote ${n}` });
  await expect(pagamento).toContainText(`${"R$ 120,00"} sem vínculo`);
  await pagamento.getByRole("button", { name: /Excluir pagamento/ }).click();
  await expect(pagamento).toHaveCount(0);
  await page.goto(`/financeiro/pagamentos?mes=${hojeMes}&aba=baixas`);
  const desfazer = page.getByRole("listitem").filter({ hasText: caio });
  await desfazer.getByRole("button", { name: "Desfazer" }).click();
  await expect(desfazer).toHaveCount(0);
});
