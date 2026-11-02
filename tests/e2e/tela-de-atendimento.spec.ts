import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { cardDoPaciente, painelDetalhes } from "./ajudantes";

// Tela de atendimento: tópicos ou relatório, texto guardado sozinho, finalizar, versões
// e o conteúdo clínico fechado para a recepção (conferido direto na API).

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);

const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const senha = `senha-teste-${n}`;
const NOME_PACIENTE = `Paciente Atendimento ${n}`;
const logins: string[] = [];
let eu: Conta;
let colega: Conta;
let recepcao: Conta;
let meuId: string;
let colegaId: string;
let pacienteId: string;

type Conta = { email: string; api: SupabaseClient };

async function novaConta(apelido: string, perfil: string, profissional: string | null): Promise<Conta> {
  const email = `${apelido}.${n}@teste.local`;
  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil }, user_metadata: { nome: apelido } });
  if (criado.error) throw criado.error;
  logins.push(criado.data.user.id);
  await admin.from("usuarios").update({ perfil, profissional_id: profissional }).eq("id", criado.data.user.id);
  const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const login = await api.auth.signInWithPassword({ email, password: senha });
  if (login.error) throw login.error;
  return { email, api };
}

async function entrar(browser: Browser, conta: Conta): Promise<Page> {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 1300, height: 900 } });
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(conta.email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
  return page;
}

function segundaDaqui(semanas: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + semanas * 7);
  return d.toISOString().slice(0, 10);
}

async function novoAtendimento(profissionais: string[], dia: string, hora = "09:00"): Promise<string> {
  const inicio = `${dia}T${hora}:00-03:00`;
  const { data, error } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pacienteId, inicio, fim: new Date(new Date(inicio).getTime() + 45 * 60_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("atendimento_profissionais").insert(profissionais.map((p) => ({ atendimento_id: data.id, profissional_id: p })));
  return data.id;
}

const campo = (page: Page, nome: string) => page.getByRole("textbox", { name: nome, exact: true });
const guardado = (page: Page) => expect(page.getByRole("status").filter({ hasText: /guardad|Guardando/i })).toHaveText("Texto guardado");

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const profs = await admin.from("profissionais").insert([{ nome: `Autor Atendimento ${n}` }, { nome: `Colega Atendimento ${n}` }]).select("id");
  if (profs.error) throw profs.error;
  [meuId, colegaId] = profs.data.map((p) => p.id);
  const paciente = await admin.from("pacientes").insert({ nome: NOME_PACIENTE }).select("id").single();
  if (paciente.error) throw paciente.error;
  pacienteId = paciente.data.id;
  await admin.from("atendimento_topicos").insert(["Evolução", "Conduta"].map((texto, i) => ({ profissional_id: meuId, texto, ordem: i + 1 })));
  eu = await novaConta("autor", "profissional", meuId);
  colega = await novaConta("colega", "profissional", colegaId);
  recepcao = await novaConta("recepcao", "limitado", null);
});

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
});

test("realiza o atendimento: formata, alterna o modelo, continua, recomeça e finaliza", async ({ browser }) => {
  const segunda = segundaDaqui(30);
  const id = await novoAtendimento([meuId], segunda);
  const page = await entrar(browser, eu);

  await page.goto(`/agenda?semana=${segunda}`);
  await cardDoPaciente(page, NOME_PACIENTE).click();
  await painelDetalhes(page).getByRole("link", { name: "Realizar atendimento" }).click();
  await expect(page).toHaveURL(new RegExp(`/atendimento/${id}`));

  // Cabeçalho e funções.
  await expect(page.getByRole("heading", { name: NOME_PACIENTE })).toBeVisible();
  for (const nome of ["Editar tópicos", "Histórico do paciente"]) await expect(page.getByRole("link", { name: nome })).toBeVisible();
  for (const nome of ["Editar dados", "Usar relatório"]) await expect(page.getByRole("button", { name: nome })).toBeVisible();

  // Formatação sobre o texto selecionado.
  const evolucao = campo(page, "Evolução");
  await evolucao.click();
  await page.keyboard.type("Texto importante");
  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: "Negrito" }).click();
  await expect(evolucao.locator("strong")).toHaveText("Texto importante");
  await page.getByRole("button", { name: "Cor do texto", exact: true }).click();
  await page.getByRole("button", { name: "Cor do texto: #1d4ed8" }).click();
  await expect(evolucao.locator("span[data-cor='#1d4ed8']")).toBeVisible();
  await page.getByRole("button", { name: "Fundo do texto", exact: true }).click();
  await page.getByRole("button", { name: "Fundo do texto: #fef08a" }).click();
  await expect(evolucao.locator("mark[data-fundo='#fef08a']")).toBeVisible();
  await page.getByRole("button", { name: "Sublinhado colorido", exact: true }).click();
  await page.getByRole("button", { name: "Sublinhado colorido: #b91c1c" }).click();
  await expect(evolucao.locator("u[data-sublinhado='#b91c1c']")).toBeVisible();

  // Listas e linha horizontal.
  await campo(page, "Conduta").click();
  await page.getByRole("button", { name: "Lista com marcadores" }).click();
  await page.keyboard.type("Primeiro passo");
  await expect(campo(page, "Conduta").locator("ul li")).toHaveText("Primeiro passo");
  await page.getByRole("button", { name: "Linha horizontal" }).click();
  await expect(campo(page, "Conduta").locator("hr")).toHaveCount(1);

  // Sem fonte nem tamanho.
  await expect(page.getByRole("toolbar", { name: "Formatação" }).getByRole("button", { name: /fonte|tamanho/i })).toHaveCount(0);

  // Alternar o modelo não apaga nada.
  await page.getByRole("button", { name: "Usar relatório" }).click();
  await expect(campo(page, "Evolução")).toHaveCount(0);
  await campo(page, "Relatório").click();
  await page.keyboard.type("Texto livre do relatório");
  await page.getByRole("button", { name: "Usar tópicos" }).click();
  await expect(campo(page, "Evolução")).toContainText("Texto importante");
  await page.getByRole("button", { name: "Usar relatório" }).click();
  await expect(campo(page, "Relatório")).toContainText("Texto livre do relatório");
  await guardado(page);

  // Sair guarda; ao voltar, o painel oferece continuar ou recomeçar.
  await page.goto(`/agenda?semana=${segunda}`);
  await cardDoPaciente(page, NOME_PACIENTE).click();
  await expect(painelDetalhes(page).getByRole("link", { name: "Realizar atendimento" })).toHaveCount(0);
  await expect(painelDetalhes(page).getByRole("button", { name: "Recomeçar atendimento" })).toBeVisible();
  await painelDetalhes(page).getByRole("link", { name: "Continuar atendimento" }).click();
  await expect(campo(page, "Relatório")).toContainText("Texto livre do relatório");
  await page.getByRole("button", { name: "Usar tópicos" }).click();
  await expect(campo(page, "Evolução").locator("strong")).toHaveText("Texto importante");
  await guardado(page);

  // Recomeçar pede confirmação e apaga o texto em andamento.
  await page.goto(`/agenda?semana=${segunda}`);
  await cardDoPaciente(page, NOME_PACIENTE).click();
  await painelDetalhes(page).getByRole("button", { name: "Recomeçar atendimento" }).click();
  await expect(painelDetalhes(page).getByRole("alert")).toContainText("será apagado");
  await painelDetalhes(page).getByRole("button", { name: "Recomeçar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/atendimento/${id}`));
  await expect(campo(page, "Evolução")).not.toContainText("Texto importante");

  // Em andamento: só o autor vê.
  await campo(page, "Evolução").click();
  await page.keyboard.type("Paciente evoluiu bem");
  await guardado(page);
  expect((await colega.api.from("registros_atendimento").select("id").eq("atendimento_id", id)).data).toEqual([]);

  // Finalizar muda o status e leva aos próximos atendimentos, filtrados pelo paciente.
  await page.getByRole("button", { name: "Finalizar atendimento" }).click();
  const fim = page.getByRole("alertdialog", { name: "Atendimento finalizado" });
  await expect(fim).toBeVisible();
  expect((await admin.from("atendimentos").select("status").eq("id", id).single()).data!.status).toBe("atendido");
  await fim.getByRole("link", { name: "Verificar próximos atendimentos" }).click();
  await expect(page).toHaveURL(new RegExp(`/agenda\\?paciente=${pacienteId}`));
  await expect(page.getByRole("status", { name: "Filtros ativos" })).toContainText("1 filtro ativo");

  // O filtro continua ao mudar de semana, e sai da URL ao ser limpo.
  await page.getByRole("link", { name: "Próximo mês" }).click();
  await expect(page).toHaveURL(new RegExp(`paciente=${pacienteId}`));
  await expect(page.getByRole("status", { name: "Filtros ativos" })).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page).not.toHaveURL(/paciente=/);
  await page.context().close();
});

test("editar depois de salvo gera versão; a anterior e os tópicos originais continuam", async ({ browser }) => {
  const id = await novoAtendimento([meuId], segundaDaqui(31));
  const page = await entrar(browser, eu);
  await page.goto(`/atendimento/${id}`);
  await campo(page, "Evolução").click();
  await page.keyboard.type("Primeira versão");
  await guardado(page);
  await page.getByRole("button", { name: "Finalizar atendimento" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ver o registro" }).click();
  await expect(page.getByRole("region", { name: "Histórico de versões" })).toContainText("Versão 1 (atual)");
  await expect(page.getByRole("region", { name: "Evolução" })).toContainText("Primeira versão");

  // Tópico novo não entra no registro salvo.
  await page.goto("/atendimento/modelo?voltar=/conta");
  await page.getByRole("button", { name: "+ Adicionar tópico" }).click();
  const novo = page.getByLabel("Tópico 3", { exact: true });
  await expect(novo).toBeFocused();
  await novo.fill("Tópico posterior");
  await novo.blur();
  await expect(page.getByRole("button", { name: "Excluir: Tópico posterior" })).toBeVisible();

  await page.goto(`/atendimento/${id}?editar=1`);
  await expect(campo(page, "Tópico posterior")).toHaveCount(0);
  await campo(page, "Evolução").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" e segunda");
  await guardado(page);
  await page.getByRole("button", { name: "Salvar nova versão" }).click();
  await expect(page.getByRole("region", { name: "Histórico de versões" })).toContainText("Versão 2 (atual)");
  await expect(page.getByRole("region", { name: "Evolução" })).toContainText("Primeira versão e segunda");
  await page.getByRole("button", { name: /^Versão 1/ }).click();
  await expect(page.getByText("Versão 1 de 2")).toBeVisible();
  await expect(page.getByRole("region", { name: "Evolução" })).not.toContainText("e segunda");

  // Aparece no histórico do paciente.
  await page.goto(`/pacientes/${pacienteId}`);
  await expect(page.getByRole("region", { name: "Registros de atendimento" })).toContainText(`Autor Atendimento ${n}`);
  await page.context().close();
});

test("em conjunto, cada profissional tem o próprio registro, e o status é um só", async ({ browser }) => {
  const id = await novoAtendimento([meuId, colegaId], segundaDaqui(32));
  for (const [conta, texto] of [[eu, "Registro do autor"], [colega, "Registro do colega"]] as const) {
    const conteudo = { modelo: "relatorio", topicos: [], relatorio: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: texto }] }] }, observacoes: null };
    expect((await conta.api.rpc("guardar_rascunho_registro", { p_atendimento: id, p_conteudo: conteudo })).error).toBeNull();
    expect((await conta.api.rpc("salvar_registro", { p_atendimento: id, p_finalizar: conta === eu })).error).toBeNull();
  }
  expect((await admin.from("atendimentos").select("status").eq("id", id).single()).data!.status).toBe("atendido");
  expect((await admin.from("registros_atendimento").select("id").eq("atendimento_id", id)).data).toHaveLength(2);

  const page = await entrar(browser, colega);
  await page.goto(`/atendimento/${id}?profissional=${meuId}`);
  await expect(page.getByRole("region", { name: "Relatório" })).toContainText("Registro do autor");
  await page.getByRole("tab", { name: `Colega Atendimento ${n}` }).click();
  await expect(page.getByRole("region", { name: "Relatório" })).toContainText("Registro do colega");
  await page.context().close();
});

test("quem não atende lê os salvos, mas não escreve; nada é apagado direto", async () => {
  const id = await novoAtendimento([meuId], segundaDaqui(33));
  const conteudo = { modelo: "relatorio", topicos: [], relatorio: null, observacoes: null };
  expect((await colega.api.rpc("guardar_rascunho_registro", { p_atendimento: id, p_conteudo: conteudo })).error?.message).toContain("próprios atendimentos");
  expect((await colega.api.rpc("salvar_registro", { p_atendimento: id, p_finalizar: true })).error?.message).toContain("próprios atendimentos");
  expect((await admin.from("atendimentos").select("status").eq("id", id).single()).data!.status).toBe("marcado");

  expect((await eu.api.rpc("guardar_rascunho_registro", { p_atendimento: id, p_conteudo: conteudo })).error).toBeNull();
  expect((await eu.api.rpc("salvar_registro", { p_atendimento: id })).error).toBeNull();
  const { data: registro } = await admin.from("registros_atendimento").select("id").eq("atendimento_id", id).single();
  expect((await colega.api.from("registros_atendimento").select("id").eq("atendimento_id", id)).data).toHaveLength(1);

  for (const conta of [eu, colega]) {
    await conta.api.from("registros_atendimento").delete().eq("id", registro!.id);
    await conta.api.from("registros_atendimento").update({ versao: 99 }).eq("id", registro!.id);
    await conta.api.from("registros_versoes").delete().eq("registro_id", registro!.id);
  }
  expect((await admin.from("registros_atendimento").select("versao").eq("id", registro!.id).single()).data!.versao).toBe(1);
  expect((await admin.from("registros_versoes").select("versao").eq("registro_id", registro!.id)).data).toHaveLength(1);
});

test("a recepção e quem está sem login não veem nada", async ({ browser }) => {
  const { data: registro } = await admin.from("registros_atendimento").select("atendimento_id").limit(1).single();
  const anonimo = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  for (const api of [recepcao.api, anonimo]) {
    for (const tabela of ["registros_atendimento", "registros_versoes", "registros_rascunhos", "atendimento_topicos"]) {
      const { data, error } = await api.from(tabela).select("*").limit(5);
      expect(error ? [] : data, tabela).toEqual([]);
    }
    expect((await api.rpc("guardar_rascunho_registro", { p_atendimento: registro!.atendimento_id, p_conteudo: {} })).error).not.toBeNull();
  }

  const page = await entrar(browser, recepcao);
  await page.goto(`/atendimento/${registro!.atendimento_id}`);
  await expect(page).toHaveURL(/\/agenda/);
  await page.goto(`/pacientes/${pacienteId}`);
  await expect(page.getByRole("heading", { name: NOME_PACIENTE })).toBeVisible();
  await expect(page.getByRole("region", { name: "Registros de atendimento" })).toHaveCount(0);
  await page.context().close();
});
