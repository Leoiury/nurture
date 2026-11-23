import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { abrirAtendimento, cadastrarPacienteNovo, cardDoPaciente, diaDaSemanaAtual, painelDetalhes, painelNovo } from "./ajudantes";

// Guias como saldo do paciente: plano + profissionais + marco zero. Gastam sessão todos os
// atendimentos do paciente no plano, com um dos profissionais, desde o marco zero.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);
const SENHA = `senha-teste-${Date.now()}`;
const logins: string[] = [];
const profissionais: string[] = [];

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
// Semanas futuras: a série toda fica depois de hoje. Às terças (segunda tem mais feriados).
const segundaDaSemana = (n: number) => somarDias(diaDaSemanaAtual(0), 7 * n);
const tercaDaSemana = (n: number) => somarDias(segundaDaSemana(n), 1);
/** Data de daqui a `dias` dias, no fuso da clínica. */
const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

async function semana(page: Page, n: number) {
  await page.goto(`/agenda?semana=${segundaDaSemana(n)}`);
  await expect(page.locator("[data-altura-medida]")).toBeAttached();
}

async function criarPlanoQueExigeGuia(page: Page, nome: string) {
  await page.goto("/configuracoes/planos");
  await page.getByRole("button", { name: "+ Novo plano" }).click();
  const novo = page.getByRole("dialog", { name: "Novo plano" });
  await novo.getByLabel("Nome").fill(nome);
  await novo.getByLabel("Valor padrão (R$)").fill("100");
  await novo.getByRole("checkbox", { name: /Exige guia/ }).check();
  await novo.getByRole("button", { name: "Salvar" }).click();
  await expect(novo).toBeHidden();
  await expect(page.getByRole("list", { name: "Planos" })).toContainText(`${nome}exige guia`);
}

/** Série semanal de um paciente novo, começando na semana `n` (futura). */
async function criarSerie(page: Page, o: { nome: string; plano: string; semana: number; hora: string; sessoes: number }) {
  await page.goto("/agenda");
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  await cadastrarPacienteNovo(page, o.nome);
  const form = painelNovo(page);
  await form.getByLabel("Profissionais").selectOption({ index: 1 });
  await form.getByLabel("Data").fill(tercaDaSemana(o.semana));
  await form.getByLabel("Início").fill(o.hora);
  await form.getByLabel("Plano").selectOption({ label: o.plano });
  await form.getByText("Repetir", { exact: true }).click();
  await form.getByRole("radio", { name: "Toda semana" }).click();
  await form.getByLabel("Número de sessões").fill(String(o.sessoes));
  await form.getByRole("button", { name: `Salvar ${o.sessoes} atendimentos` }).click();
  // Plano diferente do padrão do paciente: confirma sem mudar nada.
  await form.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(form).toBeHidden();
}

const iconeDoCard = (page: Page, nome: string) => cardDoPaciente(page, nome).locator("[data-guia]");

test.afterAll(async () => {
  for (const id of logins) await admin.auth.admin.deleteUser(id);
  await admin.from("profissionais").update({ ativo: false }).in("id", profissionais);
});

test("gerar guia pelo atendimento, alertas no fim do saldo, renovar soma e desmarcado não gasta", async ({ page }) => {
  const n = Date.now();
  const plano = `Plano Guia ${n}`;
  const nome = `Paciente Guia ${n}`;
  await criarPlanoQueExigeGuia(page, plano);
  await criarSerie(page, { nome, plano, semana: 1, hora: "12:15", sessoes: 4 });

  // Sem guia num plano que exige: vermelho.
  await semana(page, 1);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "falta");

  await abrirAtendimento(page, nome);
  const guia = painelDetalhes(page).getByRole("region", { name: "Guia", exact: true });
  await expect(guia).toContainText("O plano exige guia");
  // Relacionar não existe mais: todos os atendimentos do paciente com o profissional contam.
  await expect(guia.getByRole("button", { name: "Relacionar atendimentos" })).toHaveCount(0);
  await guia.getByRole("button", { name: "Gerar guia" }).click();
  const form = guia.getByRole("region", { name: "Gerar guia" });
  // Já vem com o plano, o profissional e a data deste atendimento.
  await expect(form.getByLabel("Plano")).toHaveValue(/.+/);
  await expect(form.getByLabel("Marco zero")).toHaveValue(tercaDaSemana(1));
  await expect(form.getByRole("checkbox", { checked: true })).toHaveCount(1);
  await form.getByLabel("Número da guia").fill("G-1");
  await form.getByLabel("Sessões", { exact: true }).fill("4");
  await form.getByRole("button", { name: "Gerar guia" }).click();
  await expect(painelDetalhes(page).getByRole("status").first()).toContainText("Guia gerada.");
  await expect(guia).toContainText("Nº G-1 · sessão 1 de 4");
  await expect(guia.getByRole("group", { name: `Guia ${plano}` })).toContainText("4 sessões agendadas · 0 sessões livres");

  // 1ª sessão: verde; 2ª a 4ª (as 3 últimas, sem renovação): amarelo.
  await semana(page, 1);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "ok");
  await semana(page, 2);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "vencendo");

  // Renovar: mais 3 no saldo; a guia antiga fica verde.
  await abrirAtendimento(page, nome);
  await guia.getByRole("button", { name: "Renovar guia" }).click();
  const renovar = guia.getByRole("region", { name: "Renovar guia" });
  await renovar.getByLabel("Número da guia").fill("G-2");
  await renovar.getByLabel("Novas sessões").fill("3");
  await renovar.getByRole("button", { name: "Renovar guia" }).click();
  await expect(guia).toContainText("sessão 2 de 7");
  await expect(guia).toContainText("Nº G-1: 4 · Nº G-2: 3");
  await semana(page, 4);
  await expect(iconeDoCard(page, nome)).toHaveAttribute("data-guia", "ok");

  // Desmarcar a 2ª: a 3ª passa a ser a sessão 2.
  await semana(page, 2);
  await abrirAtendimento(page, nome);
  await painelDetalhes(page).getByRole("radio", { name: "Desmarcado" }).click();
  await painelDetalhes(page).getByRole("radio", { name: "Paciente desmarcou" }).check();
  await painelDetalhes(page).getByRole("button", { name: "Confirmar desmarcação" }).click();
  await expect(guia).toContainText("Desmarcado não gasta sessão.");
  await semana(page, 3);
  await abrirAtendimento(page, nome);
  await expect(guia).toContainText("sessão 2 de 7");
});

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

test("uma guia para vários profissionais: o saldo é dividido conforme atendem, e o profissional é avisado do fim", async ({ page, browser }) => {
  const n = `${Date.now()}`;
  const novoProfissional = async (rotulo: string) => {
    const { data: prof } = await admin.from("profissionais").insert({ nome: `Zeta Guia ${rotulo} ${n}` }).select("id, nome").single();
    profissionais.push(prof!.id);
    const email = `guia.${rotulo.toLowerCase()}.${n}@teste.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: `Login ${rotulo}` } });
    if (error) throw error;
    logins.push(data.user.id);
    await admin.from("usuarios").update({ perfil: "profissional", profissional_id: prof!.id, nome: `Login ${rotulo}` }).eq("id", data.user.id);
    const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    await api.auth.signInWithPassword({ email, password: SENHA });
    return { ...prof!, email, api };
  };
  const [a, b, c] = [await novoProfissional("A"), await novoProfissional("B"), await novoProfissional("C")];
  const { data: plano } = await admin.from("planos").insert({ nome: `Convênio Saldo ${n}`, cor: "#0ea5e9", exige_guia: true }).select("id, nome").single();
  const { data: paciente } = await admin.from("pacientes").insert({ nome: `Paciente Saldo ${n}`, plano_id: plano!.id }).select("id, nome").single();
  async function atendimento(profissionalId: string, dias: number, status: string, planoId: string | null = plano!.id) {
    const inicio = new Date(Date.now() + dias * 86_400_000);
    inicio.setUTCHours(13, 0, 0, 0);
    const { data } = await admin
      .from("atendimentos")
      .insert({ paciente_id: paciente!.id, plano_id: planoId, status, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() })
      .select("id")
      .single();
    await admin.from("atendimento_profissionais").insert({ atendimento_id: data!.id, profissional_id: profissionalId });
  }
  await atendimento(a.id, -5, "atendido"); // gasta
  await atendimento(b.id, -3, "faltou"); // falta gasta
  await atendimento(a.id, 2, "marcado"); // agendado
  await atendimento(b.id, -4, "desmarcado"); // não gasta
  await atendimento(a.id, -20, "atendido"); // antes do marco zero
  await atendimento(c.id, -2, "atendido"); // fora da guia
  await atendimento(a.id, -1, "atendido", null); // outro plano

  await page.goto(`/pacientes/${paciente!.id}`);
  const guias = page.getByRole("region", { name: "Guias" });
  await expect(guias).toContainText("Nenhuma guia.");
  await guias.getByRole("button", { name: "Gerar guia" }).click();
  const form = guias.getByRole("region", { name: "Gerar guia" });
  await expect(form.getByLabel("Plano")).toHaveValue(plano!.id);
  await form.getByRole("checkbox", { name: a.nome }).check();
  await form.getByRole("checkbox", { name: b.nome }).check();
  await form.getByLabel("Marco zero").fill(dataDaqui(-10));
  await form.getByLabel("Sessões", { exact: true }).fill("5");
  await form.getByRole("button", { name: "Gerar guia" }).click();
  await expect(guias.getByRole("status")).toContainText("Guia gerada.");

  const resumo = guias.getByRole("group", { name: `Guia ${plano!.nome}` });
  await expect(resumo).toContainText("2 usadas de 5");
  await expect(resumo).toContainText("1 sessão agendada · 2 sessões livres");
  const uso = resumo.getByRole("list", { name: "Uso por profissional" });
  await expect(uso.getByRole("listitem").filter({ hasText: a.nome })).toContainText("1 usada · 1 agendada");
  await expect(uso.getByRole("listitem").filter({ hasText: b.nome })).toContainText("1 usada");
  await expect(uso).not.toContainText(c.nome);

  // O profissional não gera guia, nem pela API.
  expect(
    (await a.api.rpc("criar_guia", { p_paciente: paciente!.id, p_plano: plano!.id, p_profissionais: [a.id], p_marco_zero: new Date().toISOString(), p_numero: "", p_quantidade: 3 })).error,
  ).not.toBeNull();

  // Restam 3: os profissionais da guia recebem a pendência; quem não está nela, não.
  const doA = await entrar(browser, a.email);
  await doA.goto(`/pacientes/${paciente!.id}`);
  await expect(doA.getByRole("region", { name: "Guias" })).toContainText("2 usadas de 5");
  await expect(doA.getByRole("region", { name: "Guias" }).getByRole("button")).toHaveCount(0);
  await doA.getByRole("link", { name: /Notificações/ }).click();
  const pendencia = doA.getByRole("listitem", { name: `Guia: ${paciente!.nome}` });
  await expect(pendencia).toContainText("Guia perto do fim");
  await expect(pendencia).toContainText("2 de 5 sessões usadas · 1 agendada · restam 3");
  const doC = await entrar(browser, c.email);
  await doC.goto("/notificacoes");
  await expect(doC.getByRole("listitem", { name: `Guia: ${paciente!.nome}` })).toHaveCount(0);

  // Renovada, a pendência some.
  await resumo.getByRole("button", { name: "Renovar guia" }).click();
  await resumo.getByLabel("Novas sessões").fill("10");
  await resumo.getByRole("button", { name: "Renovar guia" }).click();
  await expect(resumo).toContainText("2 usadas de 15");
  await doA.reload();
  await expect(pendencia).toHaveCount(0);

  // Editar: tirar o B refaz a divisão (a falta dele deixa de gastar).
  await resumo.getByRole("button", { name: "Editar" }).click();
  await resumo.getByRole("region", { name: "Editar guia" }).getByRole("checkbox", { name: b.nome }).uncheck();
  await resumo.getByRole("button", { name: "Salvar" }).click();
  await expect(resumo).toContainText("1 usada de 15");
});
