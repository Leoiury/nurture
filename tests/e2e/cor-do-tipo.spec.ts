import { expect, test, type Page } from "@playwright/test";
import { abrirAgenda, abrirAtendimento, abrirPainelNovo, cadastrarPacienteNovo, cardDoPaciente, diaDaSemanaAtual, painelDetalhes, painelNovo } from "./ajudantes";

// Laranja do tipo Temporário (#FF6D00) e verde da Unimed (#2E7D5B), como o navegador serializa o estilo.
const LARANJA = /255, 109, 0|ff6d00/i;
const UNIMED = /46, 125, 91|2e7d5b/i;

const corDoCard = (page: Page, nome: string) => cardDoPaciente(page, nome).evaluate((e) => e.getAttribute("style") ?? "");

test("tipo Temporário deixa o card laranja; trocando o tipo, volta a cor do plano", async ({ page }) => {
  const nome = `Temporario ${Date.now()}`;
  await abrirPainelNovo(page);
  await cadastrarPacienteNovo(page, nome); // plano Unimed
  const form = painelNovo(page);
  await form.getByLabel("Profissionais").selectOption({ index: 1 });
  await form.getByLabel("Data").fill(diaDaSemanaAtual(2));
  await form.getByLabel("Início").fill("12:00");
  await form.getByLabel("Tipo").selectOption({ label: "Temporário" });
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(form).toBeHidden();

  await expect.poll(() => corDoCard(page, nome)).toMatch(LARANJA);
  await expect(page.getByText("Temporário (tipo)")).toBeAttached(); // legenda do menu

  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("button", { name: "Editar" }).click();
  const edicao = page.getByRole("dialog", { name: "Editar atendimento" });
  await edicao.getByLabel("Tipo").selectOption({ label: "Sessão Psicologia" });
  await edicao.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(edicao).toBeHidden();

  await abrirAgenda(page);
  await expect.poll(() => corDoCard(page, nome)).toMatch(UNIMED);
});
