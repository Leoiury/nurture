import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Inativação de paciente pedida pelo profissional (com os atendimentos futuros dele) e
// exclusão dos atendimentos de agora em diante pelo menu do paciente.

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
  const { data: prof } = await admin.from("profissionais").insert({ nome: `Zeta Inativação ${rotulo} ${n}` }).select("id").single();
  profissionais.push(prof!.id);
  const email = `inativacao.${rotulo.toLowerCase()}.${n}@teste.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: `Login ${rotulo}` } });
  if (error) throw error;
  logins.push(data.user.id);
  await admin.from("usuarios").update({ perfil: "profissional", profissional_id: prof!.id, nome: `Login ${rotulo}` }).eq("id", data.user.id);
  const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await api.auth.signInWithPassword({ email, password: SENHA });
  return { email, profissionalId: prof!.id, api };
}

async function novoPaciente(rotulo: string) {
  const { data } = await admin.from("pacientes").insert({ nome: `Paciente Inativação ${rotulo} ${n}` }).select("id, nome").single();
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

const situacao = async (id: string) =>
  (await admin.from("atendimentos").select("excluido_em, exclusao_solicitada_em").eq("id", id).single()).data!;

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
  for (const id of logins) {
    await admin.from("inativacoes_pedidas").delete().eq("pedido_por", id);
    await admin.auth.admin.deleteUser(id);
  }
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("o profissional pede a inativação: some da lista dele e os atendimentos futuros dele entram no fluxo de exclusão", async ({ browser }) => {
  const paciente = await novoPaciente("pedido");
  const eu = await novoProfissional("Pede");
  const colega = await novoProfissional("ColegaPede");
  const [futuro1, futuro2, passado, doColega] = [
    await atendimento(paciente.id, eu.profissionalId, 3),
    await atendimento(paciente.id, eu.profissionalId, 10),
    await atendimento(paciente.id, eu.profissionalId, -3),
    await atendimento(paciente.id, colega.profissionalId, 5),
  ];

  // Direto pela API, o profissional não inativa.
  expect((await eu.api.from("pacientes").update({ ativo: false }).eq("id", paciente.id)).error).not.toBeNull();

  const page = await entrar(browser, eu.email);
  await page.goto(`/pacientes/${paciente.id}`);
  await page.getByRole("button", { name: "Editar" }).click();
  const painel = page.getByRole("dialog", { name: "Editar paciente" });
  await painel.getByRole("checkbox", { name: /Ativo/ }).uncheck();
  const aviso = painel.getByRole("alert").filter({ hasText: `Inativar ${paciente.nome}` });
  await expect(aviso).toContainText("Os seus 2 atendimentos com este paciente de agora em diante também serão excluídos.");
  await painel.getByRole("button", { name: "Salvar" }).click();
  await expect(painel.getByRole("alert").filter({ hasText: "Informe o motivo" })).toBeVisible();
  await aviso.getByLabel("Motivo").fill("Alta do tratamento");
  await painel.getByRole("button", { name: "Salvar" }).click();
  await expect(painel).toBeHidden();
  await expect(page.getByRole("heading", { name: paciente.nome })).toContainText("aguardando confirmação");

  // Só os futuros dele: o passado e o do colega não mudam; o paciente segue ativo até a decisão.
  expect((await situacao(futuro1)).exclusao_solicitada_em).not.toBeNull();
  expect((await situacao(futuro2)).exclusao_solicitada_em).not.toBeNull();
  expect((await situacao(passado)).exclusao_solicitada_em).toBeNull();
  expect((await situacao(doColega)).exclusao_solicitada_em).toBeNull();
  expect((await admin.from("pacientes").select("ativo").eq("id", paciente.id).single()).data!.ativo).toBe(true);

  // Na lista dele, só entre os inativos.
  await page.goto("/pacientes");
  await page.getByLabel("Buscar paciente").fill(paciente.nome);
  await expect(page.getByText("Nenhum paciente encontrado.")).toBeVisible();
  await page.getByText(/Mostrar inativos/).click();
  await expect(page.getByRole("link", { name: new RegExp(paciente.nome) })).toContainText("aguardando confirmação");

  // Para o colega, nada muda.
  const outra = await entrar(browser, colega.email);
  await outra.goto("/pacientes");
  await outra.getByLabel("Buscar paciente").fill(paciente.nome);
  await expect(outra.getByRole("link", { name: new RegExp(paciente.nome) })).toBeVisible();

  // O profissional não decide o próprio pedido.
  const { data: pedido } = await admin.from("inativacoes_pedidas").select("id").eq("paciente_id", paciente.id).single();
  expect((await eu.api.rpc("decidir_inativacao", { p_id: pedido!.id, p_decisao: "inativar" })).error).not.toBeNull();
});

test("a recepção decide: inativar, manter o paciente e só excluir, ou recusar", async ({ page }) => {
  const eu = await novoProfissional("Decisao");
  async function pedir(rotulo: string) {
    const paciente = await novoPaciente(rotulo);
    const futuro = await atendimento(paciente.id, eu.profissionalId, 4);
    expect((await eu.api.rpc("pedir_inativacao", { p_paciente: paciente.id, p_motivo: `Motivo ${rotulo}` })).error).toBeNull();
    return { paciente, futuro };
  }
  const quadro = (p: Page) => p.getByRole("region", { name: "Pedido de inativação" });

  const inativar = await pedir("inativar");
  await page.goto(`/pacientes/${inativar.paciente.id}`);
  await expect(quadro(page)).toContainText("Login Decisao pediu para inativar este paciente");
  await expect(quadro(page)).toContainText("Motivo inativar");
  await quadro(page).getByRole("button", { name: "Inativar e excluir 1 atendimento" }).click();
  await expect(quadro(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: inativar.paciente.nome })).toContainText("inativo");
  expect((await situacao(inativar.futuro)).excluido_em).not.toBeNull();

  const manter = await pedir("manter");
  await page.goto(`/pacientes/${manter.paciente.id}`);
  await quadro(page).getByRole("button", { name: "Manter o paciente e só excluir os atendimentos" }).click();
  await expect(quadro(page)).toHaveCount(0);
  expect((await situacao(manter.futuro)).excluido_em).not.toBeNull();
  expect((await admin.from("pacientes").select("ativo").eq("id", manter.paciente.id).single()).data!.ativo).toBe(true);

  const recusar = await pedir("recusar");
  // Na lista da recepção, o filtro dos pedidos em aberto.
  await page.goto("/pacientes");
  await page.getByText(/Inativação pedida \(\d+\)/).click();
  await expect(page.getByRole("link", { name: new RegExp(recusar.paciente.nome) })).toContainText("inativação pedida");
  await page.goto(`/pacientes/${recusar.paciente.id}`);
  await quadro(page).getByRole("button", { name: "Recusar o pedido" }).click();
  await expect(quadro(page)).toHaveCount(0);
  const depois = await situacao(recusar.futuro);
  expect(depois.excluido_em).toBeNull();
  expect(depois.exclusao_solicitada_em).toBeNull();

  // Para quem pediu: recusado volta a aparecer; mantido continua oculto até ele reativar.
  const ocultos = (await eu.api.from("inativacoes_pedidas").select("paciente_id, decisao")).data!;
  expect(ocultos.find((o) => o.paciente_id === manter.paciente.id)!.decisao).toBe("manter");
  expect((await eu.api.rpc("reativar_paciente_para_mim", { p_paciente: manter.paciente.id })).error).toBeNull();
  expect((await eu.api.rpc("reativar_paciente_para_mim", { p_paciente: inativar.paciente.id })).error).toBeNull();
  expect((await admin.from("pacientes").select("ativo").eq("id", inativar.paciente.id).single()).data!.ativo).toBe(true);
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
  await expect(painel.getByRole("checkbox", { name: /Zeta Inativação MenuA/ })).toBeChecked();
  await expect(painel).toContainText("2 atendimentos");
  await painel.getByRole("checkbox", { name: /Zeta Inativação MenuB/ }).uncheck();
  await expect(painel.getByRole("button", { name: "Excluir 2 atendimentos" })).toBeDisabled();
  await painel.getByLabel("Motivo").fill("Mudou de cidade");
  await painel.getByRole("button", { name: "Excluir 2 atendimentos" }).click();
  await expect(painel.getByRole("status")).toContainText("2 atendimentos excluídos.");

  expect((await situacao(a1)).excluido_em).not.toBeNull();
  expect((await situacao(a2)).excluido_em).not.toBeNull();
  expect((await situacao(aPassado)).excluido_em).toBeNull();
  expect((await situacao(b1)).excluido_em).toBeNull();

  // O profissional não exclui direto, nem pela API.
  expect((await b.api.rpc("excluir_futuros_do_paciente", { p_paciente: paciente.id, p_profissionais: null as unknown as string[], p_motivo: "x" })).error).not.toBeNull();
  expect((await situacao(b1)).excluido_em).toBeNull();
});

test("pelo menu do paciente, o profissional pede a exclusão só dos atendimentos dele", async ({ browser }) => {
  const paciente = await novoPaciente("menu profissional");
  const eu = await novoProfissional("MenuEu");
  const colega = await novoProfissional("MenuColega");
  const meu = await atendimento(paciente.id, eu.profissionalId, 3);
  const doColega = await atendimento(paciente.id, colega.profissionalId, 3);

  const page = await entrar(browser, eu.email);
  await page.goto(`/pacientes/${paciente.id}`);
  await page.getByRole("button", { name: "Mais ações do paciente" }).click();
  await page.getByRole("menuitem", { name: "Pedir exclusão dos meus atendimentos…" }).click();
  const painel = page.getByRole("dialog", { name: "Pedir exclusão dos atendimentos" });
  await expect(painel).toContainText("O seu atendimento com");
  await painel.getByLabel("Motivo").fill("Encerrou comigo");
  await painel.getByRole("button", { name: "Pedir exclusão de 1 atendimento" }).click();
  await expect(painel.getByRole("status")).toContainText("Exclusão pedida para 1 atendimento.");

  const depois = await situacao(meu);
  expect(depois.exclusao_solicitada_em).not.toBeNull();
  expect(depois.excluido_em).toBeNull();
  expect((await situacao(doColega)).exclusao_solicitada_em).toBeNull();
});
