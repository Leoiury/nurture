import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { abrirAgenda, cardDoPaciente, painelDetalhes } from "./ajudantes";

// O perfil profissional nunca lê valores: as checagens vão direto na API, como faria
// quem abrisse o console do navegador, e não dependem do que as telas escondem.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_API = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_PUBLICA = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const novoCliente = (chave: string) => createClient(URL_API, chave, { auth: { persistSession: false, autoRefreshToken: false } });

const admin = novoCliente(env.SUPABASE_SECRET_KEY);
// Um login por processo de teste: os testes rodam em paralelo.
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `profissional.${n}@teste.local`;
const senha = `senha-teste-${n}`;
let usuarioId: string;
let api: SupabaseClient;
let atendimentoId: string;
let pacienteNome: string;

test.beforeAll(async () => {
  const { data: atendimento } = await admin
    .from("atendimentos")
    .select("id, valor, paciente:pacientes!inner(nome), ap:atendimento_profissionais!inner(profissional_id)")
    .is("excluido_em", null)
    .not("valor", "is", null)
    .limit(1)
    .single();
  atendimentoId = atendimento!.id;
  pacienteNome = (atendimento!.paciente as unknown as { nome: string }).nome;
  const profissionalId = (atendimento!.ap as unknown as { profissional_id: string }[])[0].profissional_id;

  const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: "Profissional Teste" } });
  if (error) throw error;
  usuarioId = criado.user.id;
  await admin.from("usuarios").update({ perfil: "profissional", profissional_id: profissionalId }).eq("id", usuarioId);

  // Gera uma observação automática com as quantias.
  await admin.from("atendimentos").update({ valor: (atendimento!.valor as number) + 1 }).eq("id", atendimentoId);

  api = novoCliente(CHAVE_PUBLICA);
  const { error: erroLogin } = await api.auth.signInWithPassword({ email, password: senha });
  if (erroLogin) throw erroLogin;
});

test.afterAll(async () => {
  if (usuarioId) await admin.auth.admin.deleteUser(usuarioId);
});

test("o perfil continua profissional depois de o login ser atualizado", async () => {
  await admin.auth.admin.updateUserById(usuarioId, { app_metadata: { perfil: "profissional", atualizado: n } });
  const { data } = await admin.from("usuarios").select("perfil").eq("id", usuarioId).single();
  expect(data!.perfil).toBe("profissional");
});

test("tabelas com valores não devolvem nada pela API", async () => {
  for (const tabela of ["atendimentos", "planos", "atendimentos_alteracoes", "pagamentos", "pagamentos_atendimentos", "baixas_atendimentos", "despesas", "atendimentos_em_aberto", "quitacoes_a_revisar"]) {
    const { data, error } = await api.from(tabela).select("*").limit(5);
    expect(error ? [] : data, tabela).toEqual([]);
  }
});

test("as visões trazem os atendimentos e os planos, sem nenhuma coluna de valor", async () => {
  const atendimentos = await api.from("atendimentos_equipe").select("*").limit(5);
  expect(atendimentos.data!.length).toBeGreaterThan(0);
  expect(Object.keys(atendimentos.data![0]).filter((c) => c.includes("valor"))).toEqual([]);

  const planos = await api.from("planos_equipe").select("*").limit(5);
  expect(planos.data!.length).toBeGreaterThan(0);
  expect(Object.keys(planos.data![0]).filter((c) => c.includes("valor"))).toEqual([]);

  expect((await api.from("atendimentos_equipe").select("valor").limit(1)).error).not.toBeNull();
});

test("observações que citam quantias ficam ocultas só para o profissional", async () => {
  const { data: todas } = await admin.from("atendimentos_observacoes").select("texto").eq("atendimento_id", atendimentoId);
  expect(todas!.some((o) => o.texto.startsWith("Valor alterado"))).toBe(true);
  const { data: visiveis } = await api.from("atendimentos_observacoes").select("texto").eq("atendimento_id", atendimentoId);
  expect(visiveis!.some((o) => o.texto.startsWith("Valor alterado"))).toBe(false);
});

test("nada é alterado direto pela API, nem pelas visões", async () => {
  const antes = await admin.from("atendimentos").select("status, valor").eq("id", atendimentoId).single();

  await api.from("atendimentos").update({ status: "faltou", valor: 0 }).eq("id", atendimentoId);
  expect((await api.from("atendimentos_equipe").update({ status: "faltou" }).eq("id", atendimentoId)).error).not.toBeNull();
  expect((await api.from("atendimentos").insert({ inicio: "2030-01-01T10:00:00Z", fim: "2030-01-01T11:00:00Z" })).error).not.toBeNull();
  expect((await api.from("atendimento_profissionais").delete().eq("atendimento_id", atendimentoId).select()).data ?? []).toEqual([]);

  expect((await admin.from("atendimentos").select("status, valor").eq("id", atendimentoId).single()).data).toEqual(antes.data);
  expect((await admin.from("atendimento_profissionais").select("profissional_id").eq("atendimento_id", atendimentoId)).data!.length).toBeGreaterThan(0);
});

test("sem login, as visões não respondem", async () => {
  const anonimo = novoCliente(CHAVE_PUBLICA);
  for (const visao of ["atendimentos_equipe", "planos_equipe"]) {
    const { data, error } = await anonimo.from(visao).select("*").limit(1);
    expect(error ? [] : data, visao).toEqual([]);
  }
});

test.describe("telas", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("abas do profissional, rotas restritas e atendimento sem valor", async ({ page }) => {
    await page.goto("/login?manual");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/agenda/);

    const menu = page.locator("header nav");
    await expect(menu.getByRole("link")).toHaveText(["Calendário", "Pacientes", "Configurações"]);

    await page.goto("/profissionais");
    await expect(page).toHaveURL(/\/agenda/);
    await page.goto("/financeiro");
    await expect(page.getByText("O financeiro é restrito à direção.")).toBeVisible();

    await abrirAgenda(page);
    const { data: linha } = await admin.from("atendimentos").select("inicio").eq("id", atendimentoId).single();
    await page.goto(`/agenda?dia=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(linha!.inicio))}`);
    await cardDoPaciente(page, pacienteNome).first().click();
    const painel = painelDetalhes(page);
    await expect(painel.getByText(pacienteNome).first()).toBeVisible();
    await expect(painel.getByText("Plano", { exact: true })).toHaveCount(0);
    await expect(painel.getByText("Valor", { exact: true })).toHaveCount(0);
    await expect(painel.getByText("R$")).toHaveCount(0);

    const { data: paciente } = await admin.from("pacientes").select("id").eq("nome", pacienteNome).limit(1).single();
    await page.goto(`/pacientes/${paciente!.id}`);
    await expect(page.getByRole("heading", { name: pacienteNome })).toBeVisible();
  });
});
