import { expect, type Page } from "@playwright/test";

/** Dia da semana atual (0 = segunda … 4 = sexta) no fuso da clínica, como AAAA-MM-DD. */
export function diaDaSemanaAtual(indice: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + indice);
  return d.toISOString().slice(0, 10);
}

export const painelNovo = (page: Page) => page.getByRole("dialog", { name: "Novo atendimento" });
export const painelDetalhes = (page: Page) => page.getByRole("dialog", { name: "Detalhes do atendimento" });
export const cardDoPaciente = (page: Page, nome: string) => page.locator(`section button[aria-label*="${nome}"]`);

export async function abrirAgenda(page: Page) {
  await page.goto("/agenda");
  await expect(page.locator("section").first()).toBeVisible();
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
}

export async function abrirPainelNovo(page: Page) {
  await abrirAgenda(page);
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await expect(painelNovo(page).getByLabel("Paciente")).toBeVisible();
}

export async function cadastrarPacienteNovo(page: Page, nome: string) {
  await painelNovo(page).getByRole("button", { name: "+ Novo" }).click();
  const cadastro = painelNovo(page).getByRole("group", { name: "Novo paciente" });
  await cadastro.getByLabel("Nome do paciente").fill(nome);
  await cadastro.getByLabel("Plano do paciente").selectOption({ label: "Unimed" });
  await cadastro.getByRole("button", { name: "Cadastrar" }).click();
  await expect(cadastro).toBeHidden();
  await expect(painelNovo(page).getByLabel("Paciente")).toHaveValue(nome);
}

/**
 * Cria, pela tela, um atendimento com um paciente novo (nome único) na semana atual.
 * Com `sessoes`, cria uma série semanal.
 */
export async function criarAtendimento(page: Page, opcoes: { nome: string; dia: number; hora: string; profissional?: number; sessoes?: number }) {
  await abrirPainelNovo(page);
  await cadastrarPacienteNovo(page, opcoes.nome);
  await painelNovo(page).getByLabel("Profissionais").selectOption({ index: opcoes.profissional ?? 1 });
  await painelNovo(page).getByLabel("Data").fill(diaDaSemanaAtual(opcoes.dia));
  await painelNovo(page).getByLabel("Início").fill(opcoes.hora);
  if (opcoes.sessoes) {
    await painelNovo(page).getByText("Repetir", { exact: true }).click();
    await painelNovo(page).getByRole("radio", { name: "Toda semana" }).click();
    await painelNovo(page).getByLabel("Número de sessões").fill(String(opcoes.sessoes));
    await painelNovo(page).getByRole("button", { name: `Salvar ${opcoes.sessoes} atendimentos` }).click();
  } else {
    await painelNovo(page).getByRole("button", { name: "Salvar", exact: true }).click();
  }
  await expect(painelNovo(page)).toBeHidden();
  await expect(cardDoPaciente(page, opcoes.nome)).toHaveCount(1);
}

/** Abre o painel de detalhes do atendimento do paciente. */
export async function abrirAtendimento(page: Page, nome: string) {
  await cardDoPaciente(page, nome).click();
  await expect(painelDetalhes(page).getByRole("heading", { name: nome })).toBeVisible();
}
