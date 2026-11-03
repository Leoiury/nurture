import { copyFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import JSZip from "jszip";

// Exportação do registro: imprimir, PDF, Word, copiar e a pasta configurada.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const senha = `senha-teste-${n}`;
const email = `exportar.${n}@teste.local`;
const PACIENTE = `João Exportação ${n}`;
const NOME_DO_ARQUIVO = `Atendimento - ${PACIENTE} - 2027-03-01`;
const marcas = [{ type: "bold" }, { type: "cor", attrs: { cor: "#1d4ed8" } }, { type: "fundo", attrs: { cor: "#fef08a" } }, { type: "sublinhado", attrs: { cor: "#b91c1c" } }];
const TEXTO = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Coração em avaliação", marks: marcas }] },
    { type: "bulletList", content: ["Primeiro item", "Segundo item"].map((text) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item numerado", marks: [{ type: "italic" }] }] }] }] },
    { type: "horizontalRule" },
    { type: "paragraph", content: [{ type: "text", text: "Depois da linha" }] },
  ],
};
let usuarioId: string;
let atendimentoId: string;

// Google Chrome: o Chromium do Playwright cai ao guardar a pasta entre uma página e outra.
test.use({ channel: "chrome" });

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { data: prof } = await admin.from("profissionais").insert({ nome: `Dra. Exportação ${n}` }).select("id").single();
  const { data: paciente } = await admin.from("pacientes").insert({ nome: PACIENTE }).select("id").single();
  const { data: topico } = await admin.from("atendimento_topicos").insert({ profissional_id: prof!.id, texto: "Evolução", ordem: 1 }).select("id").single();
  const { data: atendimento } = await admin.from("atendimentos").insert({ paciente_id: paciente!.id, inicio: "2027-03-01T09:00:00-03:00", fim: "2027-03-01T09:45:00-03:00" }).select("id").single();
  atendimentoId = atendimento!.id;
  await admin.from("atendimento_profissionais").insert({ atendimento_id: atendimentoId, profissional_id: prof!.id });
  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: "Exportação" } });
  if (criado.error) throw criado.error;
  usuarioId = criado.data.user.id;
  await admin.from("usuarios").update({ perfil: "profissional", profissional_id: prof!.id }).eq("id", usuarioId);

  // O texto já formatado: como formatar pelo editor está em tela-de-atendimento.spec.ts.
  const { data: registro } = await admin.from("registros_atendimento").insert({ atendimento_id: atendimentoId, profissional_id: prof!.id }).select("id").single();
  await admin.from("registros_rascunhos").insert({ registro_id: registro!.id, conteudo: { modelo: "topicos", topicos: [{ perguntaId: topico!.id, pergunta: "Evolução", resposta: TEXTO }], relatorio: null, observacoes: null } });
});

test.afterAll(async () => {
  if (usuarioId) await admin.auth.admin.deleteUser(usuarioId);
});

async function salvarComo(page: Page, opcao: string) {
  await page.getByRole("button", { name: "Salvar como" }).click();
  await page.getByRole("menuitem", { name: opcao }).click();
}

async function abrirComTexto(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  await page.goto(`/atendimento/${atendimentoId}`);
  await expect(page.getByRole("textbox", { name: "Evolução", exact: true })).toContainText("Coração em avaliação");
  await expect(page.getByRole("status").filter({ hasText: /guardad|Guardando/i })).toHaveText("Texto guardado");
  return page;
}

test("baixa o PDF, com pop-up de carregamento", async ({ browser }) => {
  const page = await abrirComTexto(browser);
  const download = page.waitForEvent("download");
  await salvarComo(page, "PDF");
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe(`${NOME_DO_ARQUIVO}.pdf`);
  const conteudo = readFileSync(await arquivo.path());
  expect(conteudo.subarray(0, 5).toString()).toBe("%PDF-");
  expect(conteudo.length).toBeGreaterThan(2000);
  await expect(page.getByRole("status", { name: "Exportação" })).toContainText(`Baixado: ${NOME_DO_ARQUIVO}.pdf`);
  if (process.env.PASTA_DE_AMOSTRAS) copyFileSync(await arquivo.path(), `${process.env.PASTA_DE_AMOSTRAS}/amostra.pdf`);
  await page.context().close();
});

test("baixa o Word, com texto e formatação", async ({ browser }) => {
  const page = await abrirComTexto(browser);
  const download = page.waitForEvent("download");
  await salvarComo(page, "Word");
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe(`${NOME_DO_ARQUIVO}.docx`);
  const zip = await JSZip.loadAsync(readFileSync(await arquivo.path()));
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("Coração em avaliação");
  expect(xml).toContain("Primeiro item");
  expect(xml).toContain(PACIENTE);
  expect(xml).toContain('<w:color w:val="1d4ed8"/>');
  expect(xml).toContain('w:fill="fef08a"');
  expect(xml).toContain('w:color="b91c1c"');
  if (process.env.PASTA_DE_AMOSTRAS) copyFileSync(await arquivo.path(), `${process.env.PASTA_DE_AMOSTRAS}/amostra.docx`);
  await page.context().close();
});

test("copia o texto com a formatação", async ({ browser }) => {
  const page = await abrirComTexto(browser);
  await salvarComo(page, "Copiar texto");
  await expect(page.getByRole("status", { name: "Exportação" })).toContainText("Texto copiado");
  const copiado = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType("text/html")).text(), texto: await (await item.getType("text/plain")).text() };
  });
  expect(copiado.html).toContain("<strong>Coração em avaliação</strong>");
  expect(copiado.html).toContain("color:#1d4ed8");
  expect(copiado.html).toContain("background-color:#fef08a");
  expect(copiado.html).toContain("<li>");
  expect(copiado.texto).toContain("Coração em avaliação");
  expect(copiado.texto).toContain(PACIENTE);
  await page.context().close();
});

test("imprime só o documento, por um quadro à parte", async ({ browser }) => {
  const page = await abrirComTexto(browser);
  await salvarComo(page, "Imprimir");
  const quadro = page.frameLocator("iframe[data-impressao]");
  await expect(quadro.locator("h1")).toHaveText("Registro de atendimento");
  await expect(quadro.locator("body")).toContainText("Coração em avaliação");
  await expect(quadro.locator("body")).not.toContainText("Finalizar atendimento");
  await page.context().close();
});

test("com pasta configurada, salva nela e não baixa", async ({ browser }) => {
  const page = await abrirComTexto(browser);
  await expect(page.getByRole("status").filter({ hasText: /guardad|Guardando/i })).toHaveText("Texto guardado");
  // O seletor do sistema não abre em teste: a pasta privada do navegador faz o papel dela.
  await page.goto("/conta");
  await page.evaluate(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Pacientes", { create: true });
  });
  const secao = page.getByRole("region", { name: "Pasta dos arquivos" });
  await secao.getByRole("button", { name: "Escolher a pasta" }).click();
  await expect(secao).toContainText("são salvos em");

  await page.goto(`/atendimento/${atendimentoId}`);
  let baixou = false;
  page.on("download", () => (baixou = true));
  await salvarComo(page, "PDF");
  // A biblioteca de PDF carrega só agora, e o servidor de desenvolvimento a compila na hora.
  await expect(page.getByRole("status", { name: "Exportação" })).toContainText(`Salvo em Pacientes: ${NOME_DO_ARQUIVO}.pdf`, { timeout: 30_000 });
  expect(baixou).toBe(false);
  const tamanho = await page.evaluate(async (nome) => {
    const pasta = await (await navigator.storage.getDirectory()).getDirectoryHandle("Pacientes");
    return (await (await pasta.getFileHandle(nome)).getFile()).size;
  }, `${NOME_DO_ARQUIVO}.pdf`);
  expect(tamanho).toBeGreaterThan(2000);

  // Voltar aos downloads.
  await page.goto("/conta");
  await page.getByRole("region", { name: "Pasta dos arquivos" }).getByRole("button", { name: "Usar os downloads" }).click();
  await expect(page.getByRole("region", { name: "Pasta dos arquivos" })).toContainText("vão para os downloads");
  await page.context().close();
});

test("na leitura, exporta a versão exibida", async ({ browser }) => {
  const page = await abrirComTexto(browser);
  await page.getByRole("button", { name: "Finalizar atendimento" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ver o registro" }).click();
  await salvarComo(page, "Copiar texto");
  await expect(page.getByRole("status", { name: "Exportação" })).toContainText("Texto copiado");
  const html = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType("text/html")).text();
  });
  expect(html).toContain("Coração em avaliação");
  const download = page.waitForEvent("download");
  await salvarComo(page, "Word");
  expect((await download).suggestedFilename()).toBe(`${NOME_DO_ARQUIVO}.docx`);
  await page.context().close();
});
