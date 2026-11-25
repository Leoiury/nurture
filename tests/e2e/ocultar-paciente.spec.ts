import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// O profissional oculta o paciente excluindo os atendimentos dele de agora em diante; o
// paciente volta quando alguém marca um atendimento entre os dois. Inativar é só da
// recepção e do ADM, que também excluem os atendimentos futuros pelo menu do paciente.

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
const profissionais: string[] = [];

type Conta = { email: string; profissionalId: string; api: SupabaseClient };

// "Zeta" e inativo ao final: na agenda, a primeira coluna em ordem alfabética é a de outros testes.
async function novoProfissional(rotulo: string): Promise<Conta> {
  const { data: prof } = await admin.from("profissionais").insert({ nome: `Zeta Ocultar ${rotulo} ${n}` }).select("id").single();
  profissionais.push(prof!.id);
  const email = `ocultar.${rotulo.toLowerCase()}.${n}@teste.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: `Login ${rotulo}` } });
  if (error) throw error;
  logins.push(data.user.id);
  await admin.from("usuarios").update({ perfil: "profissional", profissional_id: prof!.id, nome: `Login ${rotulo}` }).eq("id", data.user.id);
  const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await api.auth.signInWithPassword({ email, password: SENHA });
  return { email, profissionalId: prof!.id, api };
}

async function novoPaciente(rotulo: string) {
  const { data } = await admin.from("pacientes").insert({ nome: `Paciente Ocultar ${rotulo} ${n}` }).select("id, nome").single();
  return data as { id: string; nome: string };
}

/** Atendimento daqui a `dias` dias (negativo: no passado), às 10h. */
async function atendimento(pacienteId: string, profissionalId: string, dias: number) {
  const inicio = new Date(Date.now() + dias * 86400000);
  inicio.setUTCHours(13, 0, 0, 0);
  const { data } = await admin.from("atendimentos").insert({ paciente_id: pacienteId, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() }).select("id").single();
  await admin.from("atendimento_profissionais").insert({ atendimento_id: data!.id, profissional_id: profissionalId });
  return data!.id as string;
}

const excluido = async (id: string) => (await admin.from("atendimentos").select("excluido_em").eq("id", id).single()).data!.excluido_em;

async function entrar(browser: Browser, email: string): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  return page;
}

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("o profissional oculta o paciente: exclui os futuros dele, some da lista dele e volta quando marcam um atendimento", async ({ browser, page }) => {
  const paciente = await novoPaciente("lista");
  const eu = await novoProfissional("Oculta");
  const colega = await novoProfissional("Colega");
  const [futuro1, futuro2, passado, doColega] = [
    await atendimento(paciente.id, eu.profissionalId, 3),
    await atendimento(paciente.id, eu.profissionalId, 10),
    await atendimento(paciente.id, eu.profissionalId, -3),
    await atendimento(paciente.id, colega.profissionalId, 5),
  ];

  const dele = await entrar(browser, eu.email);
  await dele.goto(`/pacientes/${paciente.id}`);
  await dele.getByRole("button", { name: "Mais ações do paciente" }).click();
  await dele.getByRole("menuitem", { name: "Excluir meus atendimentos e ocultar…" }).click();
  const painel = dele.getByRole("dialog", { name: "Ocultar paciente" });
  await expect(painel).toContainText("Os seus 2 atendimentos com");
  await expect(painel.getByRole("button", { name: "Excluir 2 atendimentos e ocultar" })).toBeDisabled();
  await painel.getByLabel("Motivo").fill("Alta do tratamento");
  await painel.getByRole("button", { name: "Excluir 2 atendimentos e ocultar" }).click();
  await expect(painel.getByRole("status")).toContainText(`2 atendimentos excluídos. ${paciente.nome} saiu da sua lista.`);

  // Excluídos direto, só os futuros dele.
  expect(await excluido(futuro1)).not.toBeNull();
  expect(await excluido(futuro2)).not.toBeNull();
  expect(await excluido(passado)).toBeNull();
  expect(await excluido(doColega)).toBeNull();
  // O paciente continua ativo; a equipe recebe o aviso.
  expect((await admin.from("pacientes").select("ativo").eq("id", paciente.id).single()).data!.ativo).toBe(true);
  await page.goto("/notificacoes");
  await expect(page.getByRole("listitem", { name: `Ocultou: ${paciente.nome}` })).toContainText("da própria lista e excluiu 2 atendimentos");

  // Na lista dele, só junto com os inativos.
  await dele.goto("/pacientes");
  await dele.getByLabel("Buscar paciente").fill(paciente.nome);
  await expect(dele.getByText("Nenhum paciente encontrado.")).toBeVisible();
  await dele.getByText(/Mostrar inativos e ocultos/).click();
  await expect(dele.getByRole("link", { name: new RegExp(paciente.nome) })).toContainText("oculto");

  // Para o colega, nada muda.
  const outra = await entrar(browser, colega.email);
  await outra.goto("/pacientes");
  await outra.getByLabel("Buscar paciente").fill(paciente.nome);
  await expect(outra.getByRole("link", { name: new RegExp(paciente.nome) })).toBeVisible();
  await expect(outra.getByRole("link", { name: new RegExp(paciente.nome) })).not.toContainText("oculto");

  // Alguém marca um atendimento entre os dois: o paciente volta para ele.
  await atendimento(paciente.id, eu.profissionalId, 7);
  await dele.reload();
  await dele.getByLabel("Buscar paciente").fill(paciente.nome);
  await expect(dele.getByRole("link", { name: new RegExp(paciente.nome) })).toBeVisible();
  await expect(dele.getByRole("link", { name: new RegExp(paciente.nome) })).not.toContainText("oculto");
});

test("inativar é só da recepção e do ADM", async ({ browser, page }) => {
  const paciente = await novoPaciente("inativar");
  const eu = await novoProfissional("SemInativar");

  // Nem pela API, nem pela tela.
  expect((await eu.api.from("pacientes").update({ ativo: false }).eq("id", paciente.id)).error?.message).toContain("Só a recepção ou um administrador");
  const dele = await entrar(browser, eu.email);
  await dele.goto(`/pacientes/${paciente.id}`);
  await dele.getByRole("button", { name: "Editar" }).click();
  await expect(dele.getByRole("dialog", { name: "Editar paciente" }).getByRole("checkbox", { name: /Ativo/ })).toHaveCount(0);

  await page.goto(`/pacientes/${paciente.id}`);
  await page.getByRole("button", { name: "Editar" }).click();
  const painel = page.getByRole("dialog", { name: "Editar paciente" });
  await painel.getByRole("checkbox", { name: /Ativo/ }).uncheck();
  await painel.getByRole("button", { name: "Salvar" }).click();
  await expect(painel).toBeHidden();
  await expect(page.getByRole("heading", { name: paciente.nome })).toContainText("inativo");

  // Reativar também não é do profissional.
  expect((await eu.api.from("pacientes").update({ ativo: true }).eq("id", paciente.id)).error).not.toBeNull();
});

test("pelo menu do paciente, a recepção exclui os atendimentos futuros dos profissionais escolhidos", async ({ page }) => {
  const paciente = await novoPaciente("menu");
  const a = await novoProfissional("MenuA");
  const b = await novoProfissional("MenuB");
  const [a1, a2, aPassado, b1] = [
    await atendimento(paciente.id, a.profissionalId, 2),
    await atendimento(paciente.id, a.profissionalId, 9),
    await atendimento(paciente.id, a.profissionalId, -2),
    await atendimento(paciente.id, b.profissionalId, 6),
  ];

  await page.goto(`/pacientes/${paciente.id}`);
  await page.getByRole("button", { name: "Mais ações do paciente" }).click();
  await page.getByRole("menuitem", { name: "Excluir atendimentos…" }).click();
  const painel = page.getByRole("dialog", { name: "Excluir atendimentos" });
  await expect(painel.getByRole("checkbox", { name: /Zeta Ocultar MenuA/ })).toBeChecked();
  await expect(painel).toContainText("2 atendimentos");
  await painel.getByRole("checkbox", { name: /Zeta Ocultar MenuB/ }).uncheck();
  await expect(painel.getByRole("button", { name: "Excluir 2 atendimentos" })).toBeDisabled();
  await painel.getByLabel("Motivo").fill("Mudou de cidade");
  await painel.getByRole("button", { name: "Excluir 2 atendimentos" }).click();
  await expect(painel.getByRole("status")).toContainText("2 atendimentos excluídos.");

  expect(await excluido(a1)).not.toBeNull();
  expect(await excluido(a2)).not.toBeNull();
  expect(await excluido(aPassado)).toBeNull();
  expect(await excluido(b1)).toBeNull();

  // O profissional não exclui os dos outros, nem pela API.
  expect((await b.api.rpc("excluir_futuros_do_paciente", { p_paciente: paciente.id, p_profissionais: null as unknown as string[], p_motivo: "x" })).error).not.toBeNull();
  expect(await excluido(b1)).toBeNull();
});
