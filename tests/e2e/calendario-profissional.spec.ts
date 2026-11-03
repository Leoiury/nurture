import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { cardDoPaciente, painelDetalhes, painelNovo } from "./ajudantes";

// Calendário pessoal e ações do perfil profissional: um profissional novo, com
// pacientes próprios, em semanas distantes para não cruzar com os outros testes.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);

const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `calendario.${n}@teste.local`;
const senha = `senha-teste-${n}`;
const NOME_PACIENTE = `Paciente Calendário ${n}`;

function segundaDaqui(semanas: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + semanas * 7);
  return d.toISOString().slice(0, 10);
}
const somarDias = (dia: string, dias: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10);
const instante = (dia: string, hora: string) => `${dia}T${hora}:00-03:00`;

let api: SupabaseClient;
let usuarioId: string;
let eu: string;
let colega: string;
let pacienteId: string;
let plano: { id: string; valor_padrao: number };

async function novoAtendimento(profissionais: string[], dia: string, hora: string, status = "marcado"): Promise<string> {
  const { data, error } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pacienteId, inicio: instante(dia, hora), fim: new Date(new Date(instante(dia, hora)).getTime() + 45 * 60_000).toISOString(), status, plano_id: plano.id, valor: 99 })
    .select("id")
    .single();
  if (error) throw error;
  const vinculos = await admin.from("atendimento_profissionais").insert(profissionais.map((p) => ({ atendimento_id: data.id, profissional_id: p })));
  if (vinculos.error) throw vinculos.error;
  return data.id;
}

async function entrar(page: Page) {
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const profs = await admin.from("profissionais").insert([{ nome: `Eu Calendário ${n}` }, { nome: `Colega Calendário ${n}` }]).select("id");
  if (profs.error) throw profs.error;
  [eu, colega] = profs.data.map((p) => p.id);
  const paciente = await admin.from("pacientes").insert({ nome: NOME_PACIENTE }).select("id").single();
  if (paciente.error) throw paciente.error;
  pacienteId = paciente.data.id;
  const planos = await admin.from("planos").select("id, valor_padrao").not("valor_padrao", "is", null).limit(1).single();
  plano = planos.data as typeof plano;

  const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: "Eu Calendário" } });
  if (criado.error) throw criado.error;
  usuarioId = criado.data.user.id;
  await admin.from("usuarios").update({ perfil: "profissional", profissional_id: eu }).eq("id", usuarioId);

  api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const login = await api.auth.signInWithPassword({ email, password: senha });
  if (login.error) throw login.error;
});

test.afterAll(async () => {
  if (usuarioId) await admin.auth.admin.deleteUser(usuarioId);
  await admin.from("profissionais").update({ ativo: false }).in("id", [eu, colega]);
});

test("marca só com ele incluído, e o valor vem do plano", async () => {
  const dia = somarDias(segundaDaqui(20), 0);
  const args = { p_paciente_id: pacienteId, p_inicios: [instante(dia, "08:00")], p_duracao_min: 45, p_plano_id: plano.id };

  expect((await api.rpc("profissional_criar_atendimentos", { ...args, p_profissionais: [colega] })).error?.message).toContain("dos quais participa");

  const conjunto = await api.rpc("profissional_criar_atendimentos", { ...args, p_profissionais: [eu, colega] });
  expect(conjunto.error).toBeNull();
  const salvo = await admin.from("atendimentos").select("valor").eq("id", conjunto.data[0]).single();
  expect(Number(salvo.data!.valor)).toBe(Number(plano.valor_padrao));
});

test("só altera os próprios atendimentos, sem mexer no valor", async () => {
  const dia = segundaDaqui(21);
  const meu = await novoAtendimento([eu], dia, "08:00");
  const doColega = await novoAtendimento([colega], dia, "09:00");

  for (const [funcao, args] of [
    ["profissional_mover_atendimento", { p_id: doColega, p_inicio: instante(dia, "10:00") }],
    ["profissional_alterar_status", { p_id: doColega, p_status: "atendido" }],
    ["profissional_desmarcar_atendimentos", { p_id: doColega, p_alcance: "este", p_motivo: "x" }],
    ["profissional_solicitar_exclusao", { p_id: doColega, p_alcance: "este", p_motivo: "x" }],
  ] as const) {
    expect((await api.rpc(funcao, args)).error?.message, funcao).toContain("próprios atendimentos");
  }

  expect((await api.rpc("profissional_alterar_status", { p_id: meu, p_status: "atendido" })).error).toBeNull();
  expect((await api.rpc("profissional_mover_atendimento", { p_id: meu, p_inicio: instante(dia, "11:00") })).error).toBeNull();
  const editado = await api.rpc("profissional_editar_atendimentos", {
    p_id: meu,
    p_alcance: "este",
    p_paciente_id: pacienteId,
    p_profissionais: [eu],
    p_data: dia,
    p_hora: "11:15",
    p_duracao_min: 30,
    p_plano_id: plano.id,
  });
  expect(editado.error).toBeNull();

  const salvo = await admin.from("atendimentos").select("status, valor").eq("id", meu).single();
  expect(salvo.data).toEqual({ status: "atendido", valor: 99 });
  const intacto = await admin.from("atendimentos").select("status, inicio").eq("id", doColega).single();
  expect(intacto.data!.status).toBe("marcado");
});

test("calendário com colunas por dia, só com os próprios atendimentos", async ({ browser }) => {
  const segunda = segundaDaqui(22);
  await novoAtendimento([eu], segunda, "09:00");
  await novoAtendimento([colega], segunda, "14:00");

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await entrar(page);
  await page.goto(`/agenda?semana=${segunda}`);

  // Uma coluna por dia útil, todas do mesmo profissional.
  await expect(page.locator("[data-coluna]")).toHaveCount(5);
  for (const coluna of await page.locator("[data-coluna]").all()) expect(await coluna.getAttribute("data-coluna")).toContain(`|${eu}`);
  await expect(cardDoPaciente(page, NOME_PACIENTE)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Planejamento" })).toHaveCount(0);

  // Formulário: ele já vem incluído, sem valor e sem marcar em sequência.
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await page.getByRole("menuitem", { name: "Agendar um atendimento" }).click();
  const novo = painelNovo(page);
  await expect(novo.getByText(/Eu Calendário|Eu/).first()).toBeVisible();
  await expect(novo.getByLabel("Valor (R$)")).toHaveCount(0);
  await expect(novo.getByRole("button", { name: /Remover Eu Calendário/ })).toHaveCount(0);
  await contexto.close();
});

test('atendimento vencido sem registro mostra o "!"', async ({ browser }) => {
  const passada = segundaDaqui(-3);
  await novoAtendimento([eu], passada, "09:00");
  await novoAtendimento([eu], somarDias(passada, 1), "09:00", "atendido");

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await entrar(page);
  await page.goto(`/agenda?semana=${passada}`);
  await expect(cardDoPaciente(page, NOME_PACIENTE)).toHaveCount(2);
  await expect(page.locator("[data-pendente]")).toHaveCount(1);
  await contexto.close();
});

test("ao arrastar, mostra em cinza os horários com outros e pergunta antes de marcar por cima", async ({ browser }) => {
  const segunda = segundaDaqui(23);
  const meu = await novoAtendimento([eu], segunda, "09:00");
  await novoAtendimento([colega], somarDias(segunda, 1), "10:00");

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", viewport: { width: 1400, height: 900 } });
  const page = await contexto.newPage();
  await entrar(page);
  await page.goto(`/agenda?semana=${segunda}`);
  const card = cardDoPaciente(page, NOME_PACIENTE);
  await expect(card).toHaveCount(1);

  const caixa = (await card.boundingBox())!;
  const terca = (await page.locator(`[data-coluna="${somarDias(segunda, 1)}|${eu}"]`).boundingBox())!;
  const umaHora = await page.evaluate(() => {
    const y = (t: string) => [...document.querySelectorAll("span")].find((s) => s.textContent === t && !s.closest("button"))!.getBoundingClientRect().top;
    return y("10:00") - y("09:00");
  });
  const arrastar = async () => {
    await page.mouse.move(caixa.x + 10, caixa.y + 6);
    await page.keyboard.down("Shift");
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(caixa.x + 10 + ((terca.x + 10 - caixa.x - 10) * i) / 10, caixa.y + 6 + (umaHora * i) / 10);
  };
  const soltar = async () => {
    await page.mouse.up();
    await page.keyboard.up("Shift");
  };

  await expect(page.locator("[data-horario-com-outro]")).toHaveCount(0);
  await arrastar();
  await expect(page.locator("[data-horario-com-outro]")).toHaveCount(1);
  await expect(page.locator("[data-horario-com-outro]")).toContainText("Colega Calendário");
  await soltar();

  const aviso = page.getByRole("alertdialog", { name: "Confirmar novo horário" });
  await expect(aviso).toContainText("já tem atendimento nesse horário");
  await expect(aviso).toContainText("busca de horários livres");

  // Cancelar não move.
  await aviso.getByRole("button", { name: "Cancelar" }).click();
  const antes = await admin.from("atendimentos").select("inicio").eq("id", meu).single();
  expect(new Date(antes.data!.inicio).getTime()).toBe(new Date(instante(segunda, "09:00")).getTime());

  await arrastar();
  await soltar();
  await aviso.getByRole("button", { name: "Marcar mesmo assim" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Movido para" })).toBeVisible();
  await expect.poll(async () => new Date((await admin.from("atendimentos").select("inicio").eq("id", meu).single()).data!.inicio).getTime()).toBe(new Date(instante(somarDias(segunda, 1), "10:00")).getTime());
  await contexto.close();
});

test("excluir vira pedido: some para ele e fica apagado até a confirmação", async ({ browser, page }) => {
  const segunda = segundaDaqui(24);
  const id = await novoAtendimento([eu], segunda, "09:00");

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const dele = await contexto.newPage();
  await entrar(dele);
  await dele.goto(`/agenda?semana=${segunda}`);
  await cardDoPaciente(dele, NOME_PACIENTE).click();
  const painel = painelDetalhes(dele);
  await expect(painel.getByText("Valor", { exact: true })).toHaveCount(0);
  await painel.getByRole("button", { name: "Excluir atendimento…" }).click();
  await expect(painel).toContainText("a recepção confirma a exclusão");
  await painel.getByLabel("Motivo da exclusão").fill("Marcado por engano");
  await painel.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(painel).toHaveCount(0);
  await dele.reload();
  await expect(cardDoPaciente(dele, NOME_PACIENTE)).toHaveCount(0);
  await contexto.close();

  // Ainda não foi excluído de fato; quem não é profissional confirma.
  expect((await admin.from("atendimentos").select("excluido_em").eq("id", id).single()).data!.excluido_em).toBeNull();
  expect((await api.rpc("confirmar_exclusao", { p_id: id })).data).toBe(0);

  await page.goto(`/agenda?semana=${segunda}`);
  const card = page.locator(`[data-atendimento="${id}"]`).first();
  await expect(card).toHaveAttribute("data-esmaecido", "");
  await card.click();
  const doAdm = painelDetalhes(page);
  await expect(doAdm).toContainText("Exclusão solicitada pelo profissional");
  await expect(doAdm).toContainText("Marcado por engano");
  await doAdm.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(doAdm).toHaveCount(0);
  await expect.poll(async () => (await admin.from("atendimentos").select("excluido_em").eq("id", id).single()).data!.excluido_em).not.toBeNull();
});

test("ADM que também atende alterna entre a agenda completa e o próprio calendário", async ({ browser }) => {
  const segunda = segundaDaqui(26);
  await novoAtendimento([eu], segunda, "09:00");
  await novoAtendimento([colega], segunda, "14:00");

  const emailAdm = `adm.${n}@teste.local`;
  const criado = await admin.auth.admin.createUser({ email: emailAdm, password: senha, email_confirm: true, app_metadata: { perfil: "adm" }, user_metadata: { nome: "Direção Teste" } });
  if (criado.error) throw criado.error;
  await admin.from("usuarios").update({ perfil: "adm", profissional_id: eu }).eq("id", criado.data.user.id);

  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(emailAdm);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);

  await page.goto(`/agenda?semana=${segunda}`);
  await expect(page.getByRole("link", { name: "Planejamento" })).toBeVisible();
  await page.getByRole("link", { name: "Meu calendário" }).click();
  await expect(page).toHaveURL(/visao=pessoal/);
  await expect(page.locator("[data-coluna]")).toHaveCount(5);
  await expect(cardDoPaciente(page, NOME_PACIENTE)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Planejamento" })).toHaveCount(0);

  await page.getByRole("link", { name: "Agenda completa" }).click();
  await expect(page).not.toHaveURL(/visao=pessoal/);
  await expect(page.getByRole("link", { name: "Meu calendário" })).toBeVisible();

  await contexto.close();
  await admin.auth.admin.deleteUser(criado.data.user.id);
});

test("recusar o pedido traz o atendimento de volta", async ({ page }) => {
  const segunda = segundaDaqui(25);
  const id = await novoAtendimento([eu], segunda, "09:00");
  expect((await api.rpc("profissional_solicitar_exclusao", { p_id: id, p_alcance: "este", p_motivo: "Engano" })).error).toBeNull();
  expect((await api.from("atendimentos_equipe").select("id").eq("id", id)).data).toEqual([]);

  await page.goto(`/agenda?semana=${segunda}`);
  await page.locator(`[data-atendimento="${id}"]`).first().click();
  await painelDetalhes(page).getByRole("button", { name: "Manter atendimento" }).click();
  await expect(painelDetalhes(page).getByRole("region", { name: "Pedido de exclusão" })).toHaveCount(0);
  expect((await api.from("atendimentos_equipe").select("id").eq("id", id)).data).toHaveLength(1);
});
