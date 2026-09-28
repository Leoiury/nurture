import { expect, test } from "@playwright/test";
import { abrirPainelNovo, cadastrarPacienteNovo, painelNovo } from "./ajudantes";

test("buscar horários livres por tipo e escolher uma sugestão", async ({ page }) => {
  await abrirPainelNovo(page);
  await cadastrarPacienteNovo(page, `Teste Livres ${Date.now()}`);
  const painel = painelNovo(page);
  const busca = painel.getByRole("region", { name: "Horários livres" });

  // Sem tipo, a busca fica indisponível.
  await expect(busca.getByRole("button", { name: "Buscar horários livres" })).toBeDisabled();

  await painel.getByLabel("Tipo").selectOption({ label: "Sessão Fonoaudiologia" });
  await busca.getByRole("button", { name: "Buscar horários livres" }).click();
  const sugestoes = busca.getByRole("list", { name: "Sugestões de horário" }).getByRole("button");
  await expect(sugestoes.first()).toBeVisible();

  // Sem profissional escolhido: só fonoaudiólogos (no seed, Bruno A. e Fábio N.).
  for (const texto of await sugestoes.allInnerTexts()) expect(texto).toMatch(/· (Bruno A\.|Fábio N\.)/);

  const escolha = await sugestoes.first().innerText(); // ex.: "08:00 · Bruno A."
  await sugestoes.first().click();
  await expect(painel.getByLabel("Início")).toHaveValue(escolha.slice(0, 5));
  await expect(painel.getByRole("button", { name: /^Remover (Bruno Almeida|Fábio Nunes)$/ })).toBeVisible();

  // Com o profissional escolhido, a nova busca mostra só horários (sem nomes).
  await busca.getByRole("button", { name: "Buscar de novo" }).click();
  await expect(sugestoes.first()).not.toContainText("·");
});
