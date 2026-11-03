import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { cardDoPaciente, painelDetalhes } from "./ajudantes";

// Cobrança: cada profissional conta como um atendimento, e cada tipo diz se é cobrado.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function atendimento(pacienteId: string, profissionais: string[], extras: Record<string, unknown>) {
  const inicio = new Date(Date.now() + 2 * 3_600_000);
  const { data, error } = await admin
    .from("atendimentos")
    .insert({ paciente_id: pacienteId, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 45 * 60_000).toISOString(), ...extras })
    .select("id")
    .single();
  if (error) throw error;
  if (profissionais.length) await admin.from("atendimento_profissionais").insert(profissionais.map((profissional_id) => ({ atendimento_id: data.id, profissional_id })));
  return data.id as string;
}

const profissional = async (nome: string) => (await admin.from("profissionais").insert({ nome }).select("id").single()).data!.id as string;
const paciente = async (nome: string) => (await admin.from("pacientes").insert({ nome }).select("id").single()).data!.id as string;
const cobrado = async (id: string) => Number((await admin.from("atendimentos").select("cobrado:valor_cobrado").eq("id", id).single()).data!.cobrado);
const valor = async (id: string) => (await admin.from("atendimentos").select("valor").eq("id", id).single()).data!.valor as number | null;

test("cada profissional conta como um atendimento: no total, no saldo e na tela", async ({ page }) => {
  const [a, b] = [await profissional(`Prof A ${n}`), await profissional(`Prof B ${n}`)];
  const nome = `Cobrança Conjunta ${n}`;
  const id = await atendimento(await paciente(nome), [a, b], { valor: 150, status: "atendido", inicio: "2027-04-07T13:00:00Z", fim: "2027-04-07T13:45:00Z" });
  expect(await cobrado(id)).toBe(300);
  expect(Number((await admin.rpc("saldo_do_atendimento", { p_id: id })).data)).toBe(300);
  expect(Number((await admin.from("atendimentos_em_aberto").select("valor").eq("id", id).single()).data!.valor)).toBe(300);

  // Com um só profissional, o valor é o de sempre.
  await admin.from("atendimento_profissionais").delete().eq("atendimento_id", id).eq("profissional_id", b);
  expect(await cobrado(id)).toBe(150);
  expect(Number((await admin.rpc("saldo_do_atendimento", { p_id: id })).data)).toBe(150);
  await admin.from("atendimento_profissionais").insert({ atendimento_id: id, profissional_id: b });

  await page.goto("/agenda?semana=2027-04-07");
  await cardDoPaciente(page, nome).first().click();
  await expect(painelDetalhes(page)).toContainText("R$ 300,00");
  await expect(painelDetalhes(page)).toContainText("2 × R$ 150,00");
});

test("tipo sem cobrança: novos e futuros ficam sem valor; o passado não muda", async () => {
  const { data: plano } = await admin.from("planos").insert({ nome: `Plano Cobrança ${n}`, cor: "#123456", valor_padrao: 90, duracao_padrao_min: 45 }).select("id").single();
  const { data: tipo } = await admin.from("tipos_atendimento").insert({ nome: `Tipo Cobrança ${n}` }).select("id").single();
  const pacienteId = await paciente(`Paciente Tipo ${n}`);
  const futuro = await atendimento(pacienteId, [], { valor: 90, plano_id: plano!.id, tipo_id: tipo!.id });
  const passado = await atendimento(pacienteId, [], { valor: 90, plano_id: plano!.id, tipo_id: tipo!.id, status: "atendido", inicio: "2026-01-05T12:00:00Z", fim: "2026-01-05T12:45:00Z" });
  const realizadoFuturo = await atendimento(pacienteId, [], { valor: 90, plano_id: plano!.id, tipo_id: tipo!.id, status: "atendido" });

  await admin.from("tipos_atendimento").update({ cobrar: false }).eq("id", tipo!.id);
  expect(await valor(futuro)).toBeNull();
  expect(Number(await valor(passado))).toBe(90);
  expect(Number(await valor(realizadoFuturo))).toBe(90);

  // Novo atendimento, mesmo informando valor (o formulário ou a importação).
  expect(await valor(await atendimento(pacienteId, [], { valor: 90, plano_id: plano!.id, tipo_id: tipo!.id }))).toBeNull();

  // Religar devolve o valor do plano ao que ainda vai acontecer.
  await admin.from("tipos_atendimento").update({ cobrar: true }).eq("id", tipo!.id);
  expect(Number(await valor(futuro))).toBe(90);
});

test("o tipo Anamnese continua cobrado, e a chave aparece nas configurações", async ({ page }) => {
  const { data } = await admin.from("tipos_atendimento").select("cobrar, abre_anamnese").eq("nome", "Anamnese").single();
  expect(data).toEqual({ cobrar: true, abre_anamnese: true });
  await page.goto("/configuracoes/tipos");
  await page.getByRole("button", { name: /^Anamnese/ }).click();
  await expect(page.getByRole("checkbox", { name: /Cobrar/ })).toBeChecked();
});
