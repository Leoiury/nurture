import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { diaDaSemanaAtual } from "./ajudantes";

// Arquivos do paciente: só quem enviou, quem atendeu e ADM abrem; colegas e recepção não.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SENHA = `senha-teste-${n}`;
const logins: string[] = [];

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

async function novoLogin(rotulo: string, perfil: "profissional" | "limitado", profissionalId: string | null) {
  const email = `arquivos.${rotulo}.${n}@teste.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome: `Login ${rotulo}` } });
  if (error) throw error;
  logins.push(data.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: profissionalId }).eq("id", data.user.id);
  return email;
}

async function novoPaciente(rotulo: string) {
  const { data } = await admin.from("pacientes").insert({ nome: `Paciente Arquivos ${rotulo} ${n}` }).select("id, nome").single();
  return data as { id: string; nome: string };
}

async function entrar(page: Page, email: string) {
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
}

const secao = (page: Page) => page.getByRole("region", { name: "Arquivos" });

test.afterAll(async () => {
  for (const id of logins) {
    await admin.from("arquivos_paciente").delete().eq("enviado_por", id);
    await admin.auth.admin.deleteUser(id);
  }
});

test("na ficha: envia PDF e Word, abre, recusa o que não serve e exclui", async ({ page }) => {
  const paciente = await novoPaciente("ficha");
  await page.goto(`/pacientes/${paciente.id}`);
  await expect(secao(page)).toContainText("Nenhum arquivo.");
  const entrada = secao(page).getByLabel("Escolher arquivos");

  await entrada.setInputFiles([pdf("Laudo escolar.pdf"), { name: "Relatório.docx", mimeType: "", buffer: DOCX }]);
  await expect(secao(page).getByRole("listitem", { name: "Laudo escolar.pdf" })).toContainText("PDF");
  await expect(secao(page).getByRole("listitem", { name: "Relatório.docx" })).toContainText("Word");

  // O caminho no Storage não leva o nome do arquivo.
  const { data: linhas } = await admin.from("arquivos_paciente").select("id, caminho, nome, tipo_mime").eq("paciente_id", paciente.id);
  expect(linhas).toHaveLength(2);
  for (const l of linhas!) expect(l.caminho).toMatch(new RegExp(`^${paciente.id}/[0-9a-f-]{36}\\.(pdf|docx)$`));
  const doPdf = linhas!.find((l) => l.nome.endsWith(".pdf"))!;
  const doWord = linhas!.find((l) => l.nome.endsWith(".docx"))!;
  expect(doWord.tipo_mime).toContain("wordprocessingml");

  // PDF abre no navegador; Word vem como download, com o nome original.
  const abertoPdf = await page.request.get(`/arquivos/${doPdf.id}`);
  expect(abertoPdf.status()).toBe(200);
  expect(abertoPdf.headers()["content-type"]).toContain("application/pdf");
  expect((await abertoPdf.body()).equals(PDF)).toBe(true);
  const abertoWord = await page.request.get(`/arquivos/${doWord.id}`);
  expect(abertoWord.status()).toBe(200);
  expect(abertoWord.headers()["content-disposition"]).toContain("filename*=UTF-8''Relat%C3%B3rio.docx");

  await entrada.setInputFiles([{ name: "foto.png", mimeType: "image/png", buffer: PDF }]);
  await expect(secao(page).getByRole("alert").filter({ hasText: "apenas PDF ou Word" })).toBeVisible();
  await entrada.setInputFiles([{ name: "falso.pdf", mimeType: "application/pdf", buffer: DOCX }]);
  await expect(secao(page).getByRole("alert").filter({ hasText: "não confere" })).toBeVisible();

  const item = secao(page).getByRole("listitem", { name: "Laudo escolar.pdf" });
  await item.getByRole("button", { name: "Excluir Laudo escolar.pdf" }).click();
  await item.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(item).toHaveCount(0);
  expect((await page.request.get(`/arquivos/${doPdf.id}`)).status()).toBe(404);
  // Excluir só esconde: registro e arquivo continuam guardados.
  expect((await admin.from("arquivos_paciente").select("excluido_em").eq("id", doPdf.id).single()).data!.excluido_em).not.toBeNull();
  expect((await admin.storage.from("arquivos-pacientes").download(doPdf.caminho)).error).toBeNull();
});

test.describe("sem o login padrão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("na tela de atendimento: o profissional envia sem perder o texto, e o colega não vê", async ({ page }) => {
    const paciente = await novoPaciente("atendimento");
    const { data: prof } = await admin.from("profissionais").insert({ nome: `Profissional Arquivos ${n}` }).select("id").single();
    const { data: colega } = await admin.from("profissionais").insert({ nome: `Colega Arquivos ${n}` }).select("id").single();
    const email = await novoLogin("prof", "profissional", prof!.id);
    const emailColega = await novoLogin("colega", "profissional", colega!.id);
    const inicio = new Date(`${diaDaSemanaAtual(1)}T10:00:00-03:00`);
    const { data: at } = await admin.from("atendimentos").insert({ paciente_id: paciente.id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() }).select("id").single();
    await admin.from("atendimento_profissionais").insert({ atendimento_id: at!.id, profissional_id: prof!.id });

    await entrar(page, email);
    await page.goto(`/atendimento/${at!.id}`);
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await page.keyboard.type("Texto em andamento");

    await page.getByRole("button", { name: "Arquivos do paciente: 0" }).click();
    const painel = page.getByRole("dialog", { name: "Arquivos do paciente" });
    // Ocupa a altura da tela, e não só a do cabeçalho.
    expect((await painel.boundingBox())!.height).toBe(page.viewportSize()!.height);
    await painel.getByLabel("Escolher arquivos").setInputFiles([pdf("Encaminhamento.pdf")]);
    const item = painel.getByRole("listitem", { name: "Encaminhamento.pdf" });
    await expect(item).toContainText("neste atendimento");
    await expect(page.getByRole("button", { name: "Fechar" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Arquivos do paciente: 1" })).toBeVisible();
    await expect(editor).toContainText("Texto em andamento");

    const { data: linha } = await admin.from("arquivos_paciente").select("id, atendimento_id, enviado_por_nome, caminho").eq("paciente_id", paciente.id).single();
    expect(linha!.atendimento_id).toBe(at!.id);
    expect(linha!.enviado_por_nome).toBe("Login prof");

    // Na ficha, aparece com o link do atendimento.
    await page.goto(`/pacientes/${paciente.id}`);
    await expect(secao(page).getByRole("listitem", { name: "Encaminhamento.pdf" }).getByRole("link", { name: "ver atendimento" })).toBeVisible();

    // O colega não vê, não abre e não exclui: nem na tela, nem pelo banco.
    const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    await api.auth.signInWithPassword({ email: emailColega, password: SENHA });
    expect((await api.rpc("excluir_arquivo", { p_id: linha!.id })).error).not.toBeNull();
    expect((await api.from("arquivos_paciente").select("id").eq("id", linha!.id)).data).toEqual([]);
    expect((await api.storage.from("arquivos-pacientes").createSignedUrl(linha!.caminho, 60)).data).toBeNull();
    expect((await api.from("arquivos_paciente").update({ nome: "x" }).eq("id", linha!.id).select()).data).toEqual([]);
    expect((await api.from("arquivos_paciente").delete().eq("id", linha!.id).select()).data).toEqual([]);

    await page.context().clearCookies();
    await entrar(page, emailColega);
    await page.goto(`/pacientes/${paciente.id}`);
    await expect(secao(page)).toContainText("Nenhum arquivo.");
    expect((await page.request.get(`/arquivos/${linha!.id}`)).status()).toBe(404);
    await page.goto(`/atendimento/${at!.id}`);
    await expect(page.getByRole("button", { name: "Arquivos do paciente: 1" })).toHaveCount(0);
  });

  test("quem atendeu vê o que foi ligado ao atendimento; o que foi enviado pela ficha fica com quem enviou", async ({ page }) => {
    const paciente = await novoPaciente("atendeu");
    const { data: prof } = await admin.from("profissionais").insert({ nome: `Atendeu Arquivos ${n}` }).select("id").single();
    const email = await novoLogin("atendeu", "profissional", prof!.id);
    const inicio = new Date(`${diaDaSemanaAtual(2)}T10:00:00-03:00`);
    const { data: at } = await admin.from("atendimentos").insert({ paciente_id: paciente.id, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() }).select("id").single();
    await admin.from("atendimento_profissionais").insert({ atendimento_id: at!.id, profissional_id: prof!.id });
    const { data: outro } = await admin.from("profissionais").insert({ nome: `Remetente Arquivos ${n}` }).select("id").single();
    const emailOutro = await novoLogin("remetente", "profissional", outro!.id);
    const { data: remetente } = await admin.from("usuarios").select("id").eq("profissional_id", outro!.id).single();

    async function arquivo(nome: string, atendimentoId: string | null) {
      const caminho = `${paciente.id}/${crypto.randomUUID()}.pdf`;
      await admin.storage.from("arquivos-pacientes").upload(caminho, PDF, { contentType: "application/pdf" });
      const { data } = await admin.from("arquivos_paciente").insert({ paciente_id: paciente.id, atendimento_id: atendimentoId, nome, tipo_mime: "application/pdf", tamanho: PDF.length, caminho, enviado_por: remetente!.id, enviado_por_nome: "Remetente" }).select("id").single();
      return data!.id as string;
    }
    const doAtendimento = await arquivo("Do atendimento.pdf", at!.id);
    const daFicha = await arquivo("Da ficha.pdf", null);

    await entrar(page, email);
    await page.goto(`/pacientes/${paciente.id}`);
    await expect(secao(page).getByRole("listitem", { name: "Do atendimento.pdf" })).toBeVisible();
    await expect(secao(page).getByRole("listitem", { name: "Da ficha.pdf" })).toHaveCount(0);
    expect((await page.request.get(`/arquivos/${doAtendimento}`)).status()).toBe(200);
    expect((await page.request.get(`/arquivos/${daFicha}`)).status()).toBe(404);

    // Quem enviou continua vendo os dois.
    await page.context().clearCookies();
    await entrar(page, emailOutro);
    await page.goto(`/pacientes/${paciente.id}`);
    await expect(secao(page).getByRole("listitem")).toHaveCount(2);
    expect((await page.request.get(`/arquivos/${daFicha}`)).status()).toBe(200);
  });

  test("o ADM vê e abre o arquivo enviado por um profissional", async ({ page, browser }) => {
    const paciente = await novoPaciente("adm");
    const { data: prof } = await admin.from("profissionais").insert({ nome: `Adm Arquivos ${n}` }).select("id").single();
    const email = await novoLogin("doadm", "profissional", prof!.id);
    await entrar(page, email);
    await page.goto(`/pacientes/${paciente.id}`);
    await secao(page).getByLabel("Escolher arquivos").setInputFiles([pdf("Para a direção.pdf")]);
    await expect(secao(page).getByRole("listitem", { name: "Para a direção.pdf" })).toBeVisible();
    const { data: linha } = await admin.from("arquivos_paciente").select("id").eq("paciente_id", paciente.id).single();

    const contexto = await browser.newContext({ storageState: "tests/e2e/.auth/usuario.json" });
    const adm = await contexto.newPage();
    await adm.goto(`/pacientes/${paciente.id}`);
    await expect(secao(adm).getByRole("listitem", { name: "Para a direção.pdf" })).toBeVisible();
    expect((await adm.request.get(`/arquivos/${linha!.id}`)).status()).toBe(200);
    await contexto.close();
  });

  test("a recepção não vê nem envia, pela tela ou pela API", async ({ page }) => {
    const paciente = await novoPaciente("recepcao");
    const caminho = `${paciente.id}/${crypto.randomUUID()}.pdf`;
    await admin.storage.from("arquivos-pacientes").upload(caminho, PDF, { contentType: "application/pdf" });
    const { data: criador } = await admin.from("usuarios").select("id").limit(1).single();
    const { data: arquivo } = await admin.from("arquivos_paciente").insert({ paciente_id: paciente.id, nome: "Sigiloso.pdf", tipo_mime: "application/pdf", tamanho: PDF.length, caminho, enviado_por: criador!.id, enviado_por_nome: "x" }).select("id").single();

    const email = await novoLogin("recepcao", "limitado", null);
    await entrar(page, email);
    await page.goto(`/pacientes/${paciente.id}`);
    await expect(page.getByRole("heading", { name: paciente.nome })).toBeVisible();
    await expect(secao(page)).toHaveCount(0);
    expect((await page.request.get(`/arquivos/${arquivo!.id}`)).status()).toBe(404);

    const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    await api.auth.signInWithPassword({ email, password: SENHA });
    expect((await api.from("arquivos_paciente").select("id").eq("paciente_id", paciente.id)).data).toEqual([]);
    expect((await api.storage.from("arquivos-pacientes").createSignedUrl(caminho, 60)).data).toBeNull();
    expect((await api.storage.from("arquivos-pacientes").upload(`${paciente.id}/${crypto.randomUUID()}.pdf`, PDF, { contentType: "application/pdf" })).error).not.toBeNull();

    // Sem login, o bucket privado também não responde.
    const anonimo = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect((await anonimo.storage.from("arquivos-pacientes").download(caminho)).error).not.toBeNull();
    await admin.from("arquivos_paciente").delete().eq("id", arquivo!.id);
  });

  test("não registra arquivo de outro paciente nem o que outro login enviou", async () => {
    const [a, b] = [await novoPaciente("a"), await novoPaciente("b")];
    const { data: prof } = await admin.from("profissionais").insert({ nome: `Registro Arquivos ${n}` }).select("id").single();
    const email = await novoLogin("registro", "profissional", prof!.id);
    const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    await api.auth.signInWithPassword({ email, password: SENHA });
    const meu = `${a.id}/${crypto.randomUUID()}.pdf`;
    expect((await api.storage.from("arquivos-pacientes").upload(meu, PDF, { contentType: "application/pdf" })).error).toBeNull();
    const args = { p_atendimento: null as unknown as string, p_nome: "a.pdf" };
    expect((await api.rpc("registrar_arquivo", { ...args, p_paciente: b.id, p_caminho: meu })).error).not.toBeNull();
    const alheio = `${a.id}/${crypto.randomUUID()}.pdf`;
    await admin.storage.from("arquivos-pacientes").upload(alheio, PDF, { contentType: "application/pdf" });
    expect((await api.rpc("registrar_arquivo", { ...args, p_paciente: a.id, p_caminho: alheio })).error).not.toBeNull();
    // Enviado e ainda não registrado: não abre nem para quem enviou.
    expect((await api.storage.from("arquivos-pacientes").createSignedUrl(meu, 60)).data).toBeNull();
    expect((await api.rpc("registrar_arquivo", { ...args, p_paciente: a.id, p_caminho: meu })).error).toBeNull();
    expect((await api.storage.from("arquivos-pacientes").createSignedUrl(meu, 60)).error).toBeNull();
  });
});
