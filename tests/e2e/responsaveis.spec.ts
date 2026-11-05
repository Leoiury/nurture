import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

// Uma pessoa responde por vários pacientes, e o texto pacientes.responsavel acompanha.

const env = Object.fromEntries(
  readFileSync(".env.development.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const n = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// CPF único por execução: o banco não aceita repetido.
const CPF = String(Date.now()).slice(-11).padStart(11, "1");

const secao = (page: Page) => page.getByRole("region", { name: "Responsáveis" });
const textoDoPaciente = async (id: string) => (await admin.from("pacientes").select("responsavel").eq("id", id).single()).data!.responsavel;

async function novoPaciente(rotulo: string) {
  const nome = `Paciente Resp ${rotulo} ${n}`;
  const { data } = await admin.from("pacientes").insert({ nome }).select("id").single();
  return { id: data!.id as string, nome };
}

async function preencherNovo(page: Page, nome: string, cpf: string) {
  await secao(page).getByRole("button", { name: "Adicionar responsável" }).click();
  await secao(page).getByLabel("Nome completo").fill(nome);
  await secao(page).getByLabel("CPF").fill(cpf);
  await secao(page).getByLabel("WhatsApp").fill("(49) 90000-1234");
  await secao(page).getByLabel("E-mail").fill("familia@exemplo.com");
  await secao(page).getByRole("button", { name: "Salvar responsável" }).click();
}

test("a mesma pessoa responde por dois pacientes; ao sair do último, os dados são apagados", async ({ page }) => {
  const [a, b] = [await novoPaciente("A"), await novoPaciente("B")];
  const pessoa = `Responsável Teste ${n}`;

  await page.goto(`/pacientes/${a.id}`);
  await expect(secao(page)).toContainText("Nenhum responsável.");
  await preencherNovo(page, pessoa, CPF);
  const cartao = secao(page).getByRole("listitem", { name: pessoa });
  await expect(cartao).toContainText("(49) 90000-1234");
  await expect(cartao.getByRole("link", { name: "(49) 90000-1234" })).toHaveAttribute("href", "https://wa.me/5549900001234");
  await expect.poll(() => textoDoPaciente(a.id)).toBe(pessoa);

  // No outro paciente, o CPF repetido é recusado e a busca encontra a pessoa.
  await page.goto(`/pacientes/${b.id}`);
  await preencherNovo(page, "Outro Nome Qualquer", CPF);
  await expect(secao(page).getByRole("alert").filter({ hasText: "Já existe um responsável com esse CPF" })).toBeVisible();
  await secao(page).getByLabel("Buscar responsável").fill(CPF.slice(0, 6));
  await secao(page).getByRole("button", { name: new RegExp(pessoa) }).click();
  const noB = secao(page).getByRole("listitem", { name: pessoa });
  await expect(noB.getByRole("link", { name: a.nome })).toBeVisible();

  // O nome editado vale nos dois pacientes.
  const novoNome = `${pessoa} Silva`;
  await noB.getByRole("button", { name: `Editar responsável ${pessoa}` }).click();
  await secao(page).getByLabel("Nome completo").fill(novoNome);
  await secao(page).getByRole("button", { name: "Salvar responsável" }).click();
  await expect(secao(page).getByRole("listitem", { name: novoNome })).toBeVisible();
  await expect.poll(() => textoDoPaciente(a.id)).toBe(novoNome);
  await expect.poll(() => textoDoPaciente(b.id)).toBe(novoNome);

  // Sai de um: a pessoa continua no outro.
  const cartaoNovo = secao(page).getByRole("listitem", { name: novoNome });
  await cartaoNovo.getByRole("button", { name: `Remover responsável ${novoNome}` }).click();
  await cartaoNovo.getByRole("button", { name: "Confirmar remoção" }).click();
  await expect(secao(page)).toContainText("Nenhum responsável.");
  await expect.poll(() => textoDoPaciente(b.id)).toBeNull();
  expect((await admin.from("responsaveis").select("id").eq("cpf", CPF)).data).toHaveLength(1);

  // Sai do último: os dados somem.
  await page.goto(`/pacientes/${a.id}`);
  const ultimo = secao(page).getByRole("listitem", { name: novoNome });
  await ultimo.getByRole("button", { name: `Remover responsável ${novoNome}` }).click();
  await expect(ultimo).toContainText("os dados dela serão apagados");
  await ultimo.getByRole("button", { name: "Confirmar remoção" }).click();
  await expect(secao(page)).toContainText("Nenhum responsável.");
  await expect.poll(async () => (await admin.from("responsaveis").select("id").eq("cpf", CPF)).data).toHaveLength(0);
});
