import { expect, test, type Page } from "@playwright/test";
import { abrirAtendimento, cadastrarPacienteNovo, cardDoPaciente, diaDaSemanaAtual, painelDetalhes, painelNovo } from "./ajudantes";

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
// Semanas futuras: a série toda fica depois de hoje. Às terças (segunda tem mais feriados).
const segundaDaSemana = (n: number) => somarDias(diaDaSemanaAtual(0), 7 * n);
const tercaDaSemana = (n: number) => somarDias(segundaDaSemana(n), 1);

async function semana(page: Page, n: number) {
  await page.goto(`/agenda?semana=${segundaDaSemana(n)}`);
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
}

async function criarPlanoQueExigeGuia(page: Page, nome: string) {
  await page.goto("/configuracoes/planos");
  await page.getByRole("button", { name: "+ Novo plano" }).click();
  const novo = page.getByRole("dialog", { name: "Novo plano" });
  await novo.getByLabel("Nome").fill(nome);
  await novo.getByLabel("Valor padrão (R$)").fill("100");
  await novo.getByRole("checkbox", { name: /Exige guia/ }).check();
  await novo.getByRole("button", { name: "Salvar" }).click();
  await expect(novo).toBeHidden();
  await expect(page.getByRole("list", { name: "Planos" })).toContainText(`${nome}exige guia`);
}

/** Série semanal de um paciente novo, começando na semana `n` (futura). */
async function criarSerie(page: Page, o: { nome: string; plano?: string; semana: number; hora: string; sessoes: number }) {
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await cadastrarPacienteNovo(page, o.nome);
  const form = painelNovo(page);
  await form.getByLabel("Profissionais").selectOption({ index: 1 });
  await form.getByLabel("Data").fill(tercaDaSemana(o.semana));
  await form.getByLabel("Início").fill(o.hora);
  if (o.plano) await form.getByLabel("Plano").selectOption({ label: o.plano });
  if (o.sessoes > 1) {
    await form.getByText("Repetir", { exact: true }).click();
    await form.getByRole("radio", { name: "Toda semana" }).click();
    await form.getByLabel("Número de sessões").fill(String(o.sessoes));
    await form.getByRole("button", { name: `Salvar ${o.sessoes} atendimentos` }).click();
  } else {
    await form.getByRole("button", { name: "Salvar", exact: true }).click();
  }
  // Plano diferente do padrão do paciente: confirma sem mudar nada.
  if (o.plano) await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(form).toBeHidden();
}

const iconeDoCard = (page: Page, nome: string) => cardDoPaciente(page, nome).locator("[data-guia]");

test("gerar guia completa a série, mostra os alertas e renova", async ({ page }) => {
  const n = Date.now();
  const plano = `Plano Guia ${n}`;
  const nome = `Paciente Guia ${n}`;
  await criarPlanoQueExigeGuia(page, plano);
  await criarSerie(page, { nome, plano, semana: 1, hora: "12:15", sessoes: 2 });

  // Sem guia num plano que exige: vermelho.
  await semana(page, 1);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "falta");

  await abrirAtendimento(page, nome);
  const guia = painelDetalhes(page).getByRole("region", { name: "Guia", exact: true });
  await expect(guia).toContainText("O plano exige guia");
  await guia.getByRole("button", { name: "Gerar guia" }).click();
  const form = guia.getByRole("region", { name: "Gerar guia" });
  await form.getByLabel("Número da guia").fill("G-1");
  await form.getByLabel("Quantidade de sessões").fill("4");
  const previa = form.getByRole("status", { name: "Prévia da guia" });
  await expect(previa).toContainText("2 atendimentos já agendados");
  await expect(previa).toContainText("Serão criados 2 atendimentos");
  await form.getByRole("button", { name: "Gerar guia" }).click();
  await expect(painelDetalhes(page).getByRole("status").first()).toContainText("Guia gerada · 2 atendimentos criados.");
  await expect(guia).toContainText("Nº G-1 · sessão 1 de 4");

  // 1ª sessão: verde; 2ª a 4ª (os 3 últimos, sem renovação): amarelo.
  await semana(page, 1);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "ok");
  await semana(page, 4);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "vencendo"); // atendimento criado pela guia

  // Renovar a partir da última sessão: a guia antiga fica verde.
  await abrirAtendimento(page, nome);
  await expect(guia).toContainText("sessão 4 de 4");
  await guia.getByRole("button", { name: "Renovar guia" }).click();
  const renovar = guia.getByRole("region", { name: "Renovar guia" });
  await renovar.getByLabel("Quantidade de novas sessões").fill("2");
  await expect(renovar.getByRole("status", { name: "Prévia da guia" })).toContainText("Serão criados 2 atendimentos");
  await renovar.getByRole("button", { name: "Renovar guia" }).click();
  await expect(guia).toContainText("já renovada");
  await semana(page, 4);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "ok");
  await semana(page, 6);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "vencendo");
});

test("desmarcado não gasta sessão; relacionar junta atendimentos à guia", async ({ page }) => {
  const n = Date.now();
  const nome = `Paciente Relacionar ${n}`;
  // Uma série de 2 e, separado, um avulso no mesmo horário da semana seguinte.
  await criarSerie(page, { nome, semana: 1, hora: "12:30", sessoes: 2 });
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  const form = painelNovo(page);
  await form.getByLabel("Paciente").fill(nome);
  await page.getByRole("option", { name: new RegExp(nome) }).click();
  await form.getByLabel("Profissionais").selectOption({ index: 1 });
  await form.getByLabel("Data").fill(tercaDaSemana(3));
  await form.getByLabel("Início").fill("12:30");
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(form).toBeHidden();

  // Relaciona o avulso à série, pelo mesmo horário.
  await semana(page, 1);
  await abrirAtendimento(page, nome);
  const guia = painelDetalhes(page).getByRole("region", { name: "Guia", exact: true });
  await guia.getByRole("button", { name: "Relacionar atendimentos" }).click();
  const relacionar = guia.getByRole("region", { name: "Relacionar atendimentos" });
  await relacionar.getByRole("radio", { name: "Todos com esse profissional nesse horário" }).check();
  await relacionar.getByRole("button", { name: "Relacionar 1 atendimento" }).click();
  await expect(painelDetalhes(page).getByRole("status").first()).toContainText("1 atendimento relacionado.");

  // Guia de 3: cobre a série inteira, sem criar nada.
  await guia.getByRole("button", { name: "Gerar guia" }).click();
  const gerar = guia.getByRole("region", { name: "Gerar guia" });
  await gerar.getByLabel("Quantidade de sessões").fill("3");
  await expect(gerar.getByRole("status", { name: "Prévia da guia" })).toContainText("3 atendimentos já agendados");
  await gerar.getByRole("button", { name: "Gerar guia" }).click();
  await expect(guia).toContainText("sessão 1 de 3");

  // Desmarcar a 2ª: a do avulso passa a ser a sessão 2.
  await semana(page, 2);
  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("button", { name: "Desmarcar" }).click();
  await painelDetalhes(page).getByRole("radio", { name: "Paciente desmarcou" }).check();
  await painelDetalhes(page).getByRole("button", { name: "Confirmar desmarcação" }).click();
  await expect(guia).toContainText("Sem guia.");

  await semana(page, 3);
  await abrirAtendimento(page, nome);
  await expect(guia).toContainText("sessão 2 de 3");
  await expect(painelDetalhes(page)).toContainText("Incluído numa série de atendimentos (relacionamento de atendimentos)");
});
