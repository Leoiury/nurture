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
  // Aciona o card diretamente: no banco local, execuções anteriores deixam
  // atendimentos de teste no mesmo horário, e outro card pode ficar por cima
  // (em cascata, como deve). O clique continua passando pelo onClick real.
  await cardDoPaciente(page, nome).dispatchEvent("click");
  await expect(painelDetalhes(page).getByRole("heading", { name: nome })).toBeVisible();
}

/**
 * Um ponto livre (sem card) na primeira coluna da agenda e o horário que ele marca.
 * Usa a prévia que aparece com Shift pressionado; solta o Shift no fim.
 */
export async function horarioLivre(page: Page): Promise<{ x: number; y: number; hora: string }> {
  const coluna = page.locator("section").first().locator("[data-coluna]").first();
  const caixa = (await coluna.boundingBox())!;
  const x = caixa.x + caixa.width / 2;
  await page.keyboard.down("Shift");
  try {
    for (let y = caixa.y + 4; y < caixa.y + caixa.height; y += 12) {
      const livre = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button") === null, { x, y });
      if (!livre) continue;
      await page.mouse.move(x, y);
      const previa = coluna.getByText(/^\+ \d\d:\d\d$/);
      if (await previa.isVisible()) return { x, y, hora: (await previa.innerText()).slice(2) };
    }
  } finally {
    await page.keyboard.up("Shift");
  }
  throw new Error("Nenhum horário livre na primeira coluna.");
}

/** Simula um toque (dedo) no ponto: pointerdown, espera `segurarMs` e solta (com o clique, se curto). */
export async function tocar(page: Page, x: number, y: number, segurarMs: number, moverPara?: { x: number; y: number }, seletor?: string) {
  await page.evaluate(
    async ({ x, y, segurarMs, moverPara, seletor }) => {
      // Com seletor, toca aquele elemento (outro card pode estar por cima no mesmo ponto).
      const alvo = (seletor ? document.querySelector(seletor) : document.elementFromPoint(x, y))!;
      const base = { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 7, isPrimary: true };
      alvo.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: x, clientY: y }));
      await new Promise((r) => setTimeout(r, segurarMs));
      const fim = moverPara ?? { x, y };
      if (moverPara) {
        for (let i = 1; i <= 5; i++) {
          const px = x + ((fim.x - x) * i) / 5;
          const py = y + ((fim.y - y) * i) / 5;
          alvo.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: px, clientY: py }));
          await new Promise((r) => setTimeout(r, 20));
        }
      }
      alvo.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: fim.x, clientY: fim.y }));
      // O navegador só dispara o clique se o dedo não deslizou.
      if (!moverPara) alvo.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    },
    { x, y, segurarMs, moverPara, seletor },
  );
}
