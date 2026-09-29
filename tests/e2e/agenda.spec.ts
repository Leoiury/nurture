import { expect, test, type Page } from "@playwright/test";
import { horarioLivre } from "./ajudantes";

// Rodam contra o seed fictício (supabase/seed.sql), que preenche a semana atual.

const cards = (page: Page) => page.locator("section button[aria-label]");
const menu = (page: Page) => page.getByRole("dialog", { name: "Filtros da agenda" });

async function abrirAgenda(page: Page, caminho = "/agenda") {
  await page.goto(caminho);
  await expect(page.locator("section").first()).toBeVisible();
  // Espera o app hidratar e ajustar a escala à altura do quadro.
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
}

/**
 * O expediente 08:00–18:00 do primeiro dia cabe na altura visível do quadro?
 * Mede a extensão (independe de onde a rolagem parou): de 08:00 ao fim das 17:00,
 * mais os cabeçalhos fixos, tem que caber na altura do quadro.
 */
async function expedienteCabeNaTela(page: Page) {
  const CABECALHOS_FIXOS = 80; // profissionais + dia (empilhada) ou dias + profissionais (lado a lado)
  return page.evaluate((cabecalhos) => {
    const quadro = document.querySelector<HTMLElement>(".overflow-auto.rounded-3xl")!;
    // Rótulos do eixo de horas (fora dos cards); o primeiro de cada hora é o do primeiro dia.
    const rotulos = [...quadro.querySelectorAll("span")].filter((s) => !s.closest("button"));
    const y = (t: string) => rotulos.find((s) => s.textContent === t)?.getBoundingClientRect().top;
    const oito = y("08:00");
    const dezesseis = y("16:00");
    const dezessete = y("17:00");
    if (oito === undefined || dezesseis === undefined || dezessete === undefined) return false;
    const fimDoExpediente = dezessete + (dezessete - dezesseis); // 18:00
    return fimDoExpediente - oito + cabecalhos <= quadro.clientHeight;
  }, CABECALHOS_FIXOS);
}

test("semana atual mostra os atendimentos do seed", async ({ page }) => {
  await abrirAgenda(page);
  await expect(cards(page).first()).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThan(20);
  await expect(page.getByText("Hoje").first()).toBeVisible();
});

test("empilhado: 08:00–18:00 cabe na tela, inclusive com zoom", async ({ page }) => {
  await abrirAgenda(page);
  expect(await expedienteCabeNaTela(page)).toBe(true);

  // Zoom de 150% numa tela 1440x900 equivale a uma janela de 960x600.
  await page.setViewportSize({ width: 960, height: 600 });
  await expect.poll(() => expedienteCabeNaTela(page)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("painel do atendimento mostra dados e leva à página do paciente", async ({ page }) => {
  await abrirAgenda(page);
  await cards(page).first().click();
  const painel = page.getByRole("dialog", { name: "Detalhes do atendimento" });
  await expect(painel.getByRole("link", { name: "Ver página do paciente" })).toHaveAttribute("href", /^\/pacientes\/[0-9a-f-]{36}$/);
  await expect(painel.getByText("Histórico")).toHaveCount(0);
  await expect(painel.getByText("Profissional")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(painel).toBeHidden();
});

test("troca de visão pelo menu e preservação ao navegar", async ({ page }) => {
  await abrirAgenda(page);

  await page.getByRole("button", { name: /Filtros/ }).click();
  await menu(page).getByRole("link", { name: /Lado a lado/ }).click();
  await expect(page).toHaveURL(/visao=lado/);
  await expect(menu(page)).not.toBeInViewport(); // o menu fecha ao escolher
  expect(await expedienteCabeNaTela(page)).toBe(true);

  // Trocar de mês mantém a visão. Espera a URL nova (com semana=) antes de seguir:
  // a anterior também tinha visao=lado e o menu abriria antes da navegação terminar.
  await page.getByRole("link", { name: "Próximo mês" }).click();
  await expect(page).toHaveURL(/semana=.*visao=lado/);
  await expect(page.locator("section").first()).toBeVisible();

  await page.getByRole("button", { name: /Filtros/ }).click();
  await menu(page).getByRole("link", { name: /Ampliado/ }).click();
  await expect(page).toHaveURL(/visao=ampliada/);
});

test("ampliado: escala fixa de 112 px por hora e meias horas no eixo", async ({ page }) => {
  await abrirAgenda(page, "/agenda?visao=ampliada");
  const altura = await page.evaluate(() => {
    const secao = document.querySelector("section")!;
    const rotulo = (t: string) => [...secao.querySelectorAll("span")].find((s) => s.textContent === t && !s.closest("button"));
    // Mede entre linhas de hora consecutivas (09:00 → 10:00), que usam o mesmo posicionamento.
    return rotulo("10:00")!.getBoundingClientRect().top - rotulo("09:00")!.getBoundingClientRect().top;
  });
  expect(Math.round(altura)).toBe(112);
  await expect(page.locator("section").first().getByText("08:30", { exact: true })).toBeVisible();
});

test("modo foco: esconde cabeçalho e barra, lembra ao recarregar e sai pelo botão do topo", async ({ page }) => {
  await abrirAgenda(page);
  const barra = page.locator("[data-barra-agenda]");
  const cabecalho = page.locator("[data-cabecalho-app]");

  await page.getByRole("button", { name: "Ampliar a agenda" }).click();
  await expect(barra).toBeHidden();
  await expect(cabecalho).toBeHidden();
  await expect(page.getByRole("button", { name: "Sair do modo foco" })).toBeVisible();

  // Recarregando, a barra já vem escondida no HTML inicial (script no <head>).
  await page.reload({ waitUntil: "commit" });
  await page.locator("[data-barra-agenda]").waitFor({ state: "attached" });
  expect(await barra.evaluate((e) => getComputedStyle(e).display)).toBe("none");

  // Navegação pelo menu, que no foco ganha a seção Período.
  // No foco, os filtros viram um botão flutuante só com ícone, no canto superior esquerdo.
  const filtrosFlutuante = page.locator("button[data-botao-flutuante][aria-label='Filtros']");
  const caixa = (await filtrosFlutuante.boundingBox())!;
  expect(caixa.x).toBeLessThan(40);
  expect(caixa.y).toBeLessThan(40);
  await filtrosFlutuante.click();
  await expect(menu(page).getByText("Período")).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sair do modo foco" }).click();
  await expect(barra).toBeVisible();
  await expect(cabecalho).toBeVisible();
});

test("colunas em ordem decrescente de atendimentos na semana", async ({ page }) => {
  await abrirAgenda(page);
  const nomes = await page.locator(".sticky.top-0 > div[title]").evaluateAll((els) => els.map((e) => e.getAttribute("title")!.split(" · ")[0]));
  const totais = await page.evaluate((lista) => {
    // Cada atendimento conta uma vez por profissional, mesmo aparecendo em várias
    // colunas (atendimento conjunto): deduplica pelo id.
    const vistos = new Set<string>();
    const contagem = new Map<string, number>();
    for (const b of document.querySelectorAll("section button[data-atendimento]")) {
      const id = b.getAttribute("data-atendimento")!;
      const rotulo = b.getAttribute("aria-label")!;
      if (vistos.has(id) || rotulo.endsWith("desmarcado")) continue;
      vistos.add(id);
      // Descrição: "horário · paciente · profissional A + profissional B · plano · tipo · status"
      const profissionais = rotulo.split(" · ")[2].split(" + ");
      for (const n of lista.filter((n) => profissionais.includes(n))) contagem.set(n, (contagem.get(n) ?? 0) + 1);
    }
    return lista.map((n) => contagem.get(n) ?? 0);
  }, nomes);
  expect(totais).toEqual([...totais].sort((a, b) => b - a));
});

test("celular: a página não rola na horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirAgenda(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test("cabeçalho mostra o nome abreviado (primeiro nome + inicial do sobrenome)", async ({ page }) => {
  await abrirAgenda(page);
  const nomes = await page.locator(".sticky.top-0 > div[title] span").allInnerTexts();
  expect(nomes.length).toBeGreaterThan(0);
  for (const nome of nomes) expect(nome).toMatch(/^\S+( \p{Lu}\.)?$/u);
});

test("botão de filtros só com ícone e botão + abre o novo atendimento", async ({ page }) => {
  await abrirAgenda(page);
  const filtros = page.locator("[data-barra-agenda]").getByRole("button", { name: "Filtros" });
  await expect(filtros).toBeVisible();
  expect((await filtros.innerText()).replace(/\d/g, "").trim()).toBe("");

  const mais = page.getByRole("button", { name: "Novo atendimento" });
  const caixa = (await mais.boundingBox())!;
  const tela = page.viewportSize()!;
  expect(caixa.x + caixa.width).toBeGreaterThan(tela.width - 40);
  expect(caixa.y + caixa.height).toBeGreaterThan(tela.height - 40);
  await mais.click();
  await expect(page.getByRole("dialog", { name: "Novo atendimento" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Novo atendimento" })).toBeHidden();
});

test("abre rolada até o dia de hoje", async ({ page }) => {
  await abrirAgenda(page);
  const hoje = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  const secao = page.locator(`section[aria-label="${hoje}"]`);
  test.skip((await secao.count()) === 0, "hoje é fim de semana sem atendimentos");
  const distancia = await secao.evaluate((s) => s.getBoundingClientRect().top - s.closest(".overflow-auto")!.getBoundingClientRect().top);
  // Logo abaixo do cabeçalho dos profissionais (40 px).
  expect(Math.abs(distancia - 40)).toBeLessThan(4);
});

test("Shift + clique num horário vazio abre o formulário preenchido", async ({ page }) => {
  await abrirAgenda(page);
  const primeiroProfissional = await page.locator(".sticky.top-0 > div[title]").first().getAttribute("title");
  const { x, y, hora } = await horarioLivre(page);

  // Sem a tecla: só uma dica, nada é aberto.
  await page.mouse.click(x, y);
  await expect(page.getByRole("status")).toContainText("segure Shift ou Ctrl");
  await expect(page.getByRole("dialog", { name: "Novo atendimento" })).toHaveCount(0);

  await page.keyboard.down("Shift");
  await page.mouse.click(x, y);
  await page.keyboard.up("Shift");
  const painel = page.getByRole("dialog", { name: "Novo atendimento" });
  await expect(painel.getByLabel("Início")).toHaveValue(hora);
  await expect(painel.getByRole("button", { name: /^Remover / })).toHaveAccessibleName(`Remover ${primeiroProfissional!.split(" · ")[0]}`);
});
