import { expect, test } from "@playwright/test";
import { abrirAtendimento, cardDoPaciente, criarAtendimento, painelDetalhes } from "./ajudantes";

// Cada teste cria seu próprio atendimento (paciente com nome único) e mexe só nele.

const unico = (prefixo: string) => `${prefixo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("status rápido e observações (manuais e automáticas)", async ({ page }) => {
  const nome = unico("Teste Status");
  await criarAtendimento(page, { nome, dia: 3, hora: "12:15" });
  await abrirAtendimento(page, nome);
  const painel = painelDetalhes(page);

  await painel.getByRole("radio", { name: "Atendido" }).click();
  await expect(painel.getByRole("radio", { name: "Atendido" })).toHaveAttribute("aria-checked", "true");

  await painel.getByLabel("Nova observação").fill("Trouxe o laudo da escola");
  await painel.getByRole("button", { name: "Adicionar" }).click();
  const observacoes = painel.getByRole("list", { name: "Lista de observações" });
  await expect(observacoes).toContainText("Trouxe o laudo da escola");
  await expect(observacoes).toContainText("Status: marcado → atendido");
});

test("editar o horário move o card e registra a mudança", async ({ page }) => {
  const nome = unico("Teste Editar");
  await criarAtendimento(page, { nome, dia: 3, hora: "12:00" });
  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("button", { name: "Editar" }).click();

  const edicao = page.getByRole("dialog", { name: "Editar atendimento" });
  await expect(edicao.getByLabel("Paciente")).toHaveValue(nome);
  await edicao.getByLabel("Início").fill("12:30");
  await edicao.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(edicao).toBeHidden();

  await expect(cardDoPaciente(page, nome)).toHaveAttribute("aria-label", /12:30/);
  await abrirAtendimento(page, nome);
  await expect(painelDetalhes(page).getByRole("list", { name: "Lista de observações" })).toContainText("Horário alterado");
});

test("desmarcar exige motivo e tira o card da agenda", async ({ page }) => {
  const nome = unico("Teste Desmarcar");
  await criarAtendimento(page, { nome, dia: 4, hora: "12:15" });
  await abrirAtendimento(page, nome);
  const painel = painelDetalhes(page);

  await painel.getByRole("button", { name: "Desmarcar" }).click();
  const confirmar = painel.getByRole("button", { name: "Confirmar desmarcação" });
  await expect(confirmar).toBeDisabled();
  await painel.getByRole("radio", { name: "Paciente desmarcou" }).click();
  await painel.getByLabel("Detalhe do motivo").fill("viagem");
  await confirmar.click();

  await expect(painel.getByRole("status")).toHaveText("Atendimento desmarcado.");
  await expect(painel).toContainText("Paciente desmarcou: viagem");
  await page.keyboard.press("Escape");
  // Desmarcados ficam ocultos por padrão.
  await expect(cardDoPaciente(page, nome)).toHaveCount(0);
});

test("excluir exige observação e remove o atendimento", async ({ page }) => {
  const nome = unico("Teste Excluir");
  await criarAtendimento(page, { nome, dia: 4, hora: "12:30" });
  await abrirAtendimento(page, nome);
  const painel = painelDetalhes(page);

  await painel.getByRole("button", { name: "Excluir atendimento…" }).click();
  const excluir = painel.getByRole("button", { name: "Excluir", exact: true });
  await expect(excluir).toBeDisabled();
  await painel.getByLabel("Motivo da exclusão").fill("Lançado em duplicidade");
  await excluir.click();

  await expect(painel).toBeHidden();
  await expect(cardDoPaciente(page, nome)).toHaveCount(0);
});

test("série: desmarcar este e os próximos", async ({ page }) => {
  const nome = unico("Teste Serie Desmarcar");
  await criarAtendimento(page, { nome, dia: 0, hora: "12:45", sessoes: 3 });
  await abrirAtendimento(page, nome);
  const painel = painelDetalhes(page);
  await expect(painel).toContainText("Toda semana · 3 atendimentos");

  await painel.getByRole("button", { name: "Desmarcar" }).click();
  await painel.getByRole("radio", { name: "Profissional ausente" }).click();
  await painel.getByRole("radio", { name: "Este e os próximos (3)" }).click();
  await painel.getByRole("button", { name: "Confirmar desmarcação" }).click();
  await expect(painel.getByRole("status")).toHaveText("3 atendimentos desmarcados.");
});
