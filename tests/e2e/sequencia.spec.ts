import { expect, test } from "@playwright/test";
import { abrirPainelNovo, cadastrarPacienteNovo, cardDoPaciente, painelNovo } from "./ajudantes";

test("horários em sequência: um atendimento com cada profissional, colados", async ({ page }) => {
  const nome = `Sequencia ${Date.now()}`;
  await abrirPainelNovo(page);
  await cadastrarPacienteNovo(page, nome);
  const form = painelNovo(page);
  await form.getByLabel("Profissionais").selectOption({ label: "Ana Beatriz Costa — Psicóloga" });
  await form.getByLabel("Profissionais").selectOption({ label: "Bruno Almeida — Fonoaudiólogo" });
  await form.getByRole("radio", { name: "Em sequência, um atendimento após o outro" }).check();

  // Sugestões de horários em sequência, com a ordem dos atendimentos.
  const busca = form.getByRole("region", { name: "Horários livres" });
  await busca.getByRole("button", { name: "Buscar horários livres" }).click();
  const sugestao = busca.getByRole("list", { name: "Sugestões de horário" }).getByRole("button").filter({ hasText: "→" }).first();
  await sugestao.click();

  // Cada um com o seu tipo, o segundo logo depois do primeiro.
  const sequencia = form.getByRole("region", { name: "Sequência" });
  const linhas = sequencia.getByRole("listitem");
  await expect(linhas).toHaveCount(2);
  const texto = (await sequencia.innerText()).replace(/\s+/g, " ");
  expect(texto).toMatch(/Ana B\. Sessão Psicologia|Bruno A\. Sessão Fonoaudiologia/);
  const [h1, h2] = (await linhas.allInnerTexts()).map((t) => t.match(/\d\d:\d\d/)![0]);
  const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  expect(minutos(h2) - minutos(h1)).toBe(45);

  const data = await form.getByLabel("Data").inputValue();
  await form.getByRole("button", { name: "Salvar 2 atendimentos" }).click();
  await expect(form).toBeHidden();

  await page.goto(`/agenda?semana=${data}`);
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
  await expect(cardDoPaciente(page, nome)).toHaveCount(2);
  await expect(cardDoPaciente(page, nome).filter({ hasText: `${h1} – ` })).toHaveAttribute("aria-label", /Sessão (Psicologia|Fonoaudiologia)/);
});
