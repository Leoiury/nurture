import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { cardDoPaciente, diaDaSemanaAtual, painelDetalhes } from "./ajudantes";

// Telas do perfil profissional: cor por status, personalizada por login, sem plano; e a triagem.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const novoCliente = (chave: string) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = novoCliente(env.SUPABASE_SECRET_KEY);
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `cores.${n}@teste.local`;
const senha = `senha-teste-${n}`;
const paciente = `Paciente Cores ${n}`;
const dia = diaDaSemanaAtual(2);
const AZUL = /rgb\(74, 144, 217\)|#4a90d9/i;
const ROXO = /rgb\(179, 157, 219\)|#b39ddb/i;
const CINZA = /rgb\(208, 211, 212\)|#d0d3d4/i;
let usuarioId: string;
let profissionalId: string;
let pacienteId: string;
let atendimentoId: string;

async function criarAtendimento(tipoId: string | null, planoId: string | null, hora: string) {
  const inicio = new Date(`${dia}T${hora}:00-03:00`);
  const { data, error } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pacienteId, plano_id: planoId, tipo_id: tipoId, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("atendimento_profissionais").insert({ atendimento_id: data.id, profissional_id: profissionalId });
  return data.id as string;
}

async function entrar(page: Page) {
  await page.goto("/login?manual");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/agenda/);
}

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { data: plano } = await admin.from("planos").select("id").eq("nome", "Unimed").single();
  const { data: prof } = await admin.from("profissionais").insert({ nome: `Profissional Cores ${n}` }).select("id").single();
  profissionalId = prof!.id;
  const { data: pac } = await admin.from("pacientes").insert({ nome: paciente, plano_id: plano!.id }).select("id").single();
  pacienteId = pac!.id;
  const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { perfil: "profissional" }, user_metadata: { nome: "Cores" } });
  if (error) throw error;
  usuarioId = criado.user.id;
  await admin.from("usuarios").update({ perfil: "profissional", profissional_id: profissionalId }).eq("id", usuarioId);
  atendimentoId = await criarAtendimento(null, plano!.id, "10:00");
});

test.afterAll(async () => {
  if (usuarioId) await admin.auth.admin.deleteUser(usuarioId);
});

test("o card segue o status e o profissional escolhe as próprias cores, sem ver o plano", async ({ page }) => {
  await entrar(page);
  await page.goto(`/agenda?dia=${dia}`);
  const card = cardDoPaciente(page, paciente);
  await expect(card).toHaveAttribute("style", AZUL);
  await expect(card).not.toHaveAttribute("aria-label", /Unimed/);

  await card.click();
  const painel = painelDetalhes(page);
  await expect(painel.getByRole("radio", { name: "Desmarcado" })).toBeVisible();
  await expect(painel.getByText("Plano", { exact: true })).toHaveCount(0);
  await expect(painel.getByText("Plano padrão")).toHaveCount(0);

  await page.goto("/conta");
  const marcado = page.getByRole("region", { name: "Cores do calendário" }).getByRole("radiogroup", { name: "Marcado", exact: true });
  await marcado.getByRole("radio", { name: "Roxo" }).click();
  await expect.poll(async () => (await admin.from("usuarios").select("cores_status").eq("id", usuarioId).single()).data!.cores_status.marcado).toBe("#B39DDB");
  await page.goto(`/agenda?dia=${dia}`);
  await expect(cardDoPaciente(page, paciente)).toHaveAttribute("style", ROXO);

  // Desmarcado continua à vista, na própria cor.
  await admin.from("atendimentos").update({ status: "desmarcado", motivo_desmarcacao: "Teste" }).eq("id", atendimentoId);
  await page.reload();
  await expect(cardDoPaciente(page, paciente)).toHaveAttribute("style", CINZA);

  // Ficha do paciente também sem plano.
  await page.goto(`/pacientes/${pacienteId}`);
  await expect(page.getByRole("heading", { name: paciente })).toBeVisible();
  await expect(page.getByRole("region", { name: "Plano do paciente" })).toHaveCount(0);
  await expect(page.getByText("Unimed")).toHaveCount(0);
});

test("triagem abre o modelo da anamnese, sem se misturar com uma anamnese em andamento", async ({ page }) => {
  await entrar(page);
  const { data: tipo } = await admin.from("tipos_atendimento").select("id").eq("nome", "Triagem").single();
  const triagem = await criarAtendimento(tipo!.id, null, "14:00");

  await page.goto(`/atendimento/${triagem}`);
  await expect(page).toHaveURL(/\/anamnese\/[0-9a-f-]{36}/);
  await expect(page.locator("header").getByText("Triagem", { exact: true })).toBeVisible();
  const idDaTriagem = page.url().split("/").pop()!.split("?")[0];

  const api = novoCliente(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await api.auth.signInWithPassword({ email, password: senha });
  const { data: idDaAnamnese, error } = await api.rpc("iniciar_anamnese", { p_paciente: pacienteId });
  expect(error).toBeNull();
  expect(idDaAnamnese).not.toBe(idDaTriagem);

  await page.goto(`/pacientes/${pacienteId}`);
  await expect(page.getByRole("region", { name: "Anamneses" }).getByText(`Triagem · Profissional Cores ${n}`)).toBeVisible();
});
