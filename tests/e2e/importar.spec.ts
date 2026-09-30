import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { cardDoPaciente, criarAtendimento, diaDaSemanaAtual } from "./ajudantes";

// Relatório fictício no formato do sistema anterior (nunca dados reais).
type Linha = { id: number; data: string; hora: string; pacienteId: number; nome: string; convenio: string; valor?: string; status?: string; deletado?: boolean };

async function relatorio(linhas: Linha[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  ws.addRow(["Relatório de agendamentos"]);
  ws.addRow(["#", "Data Atend", "Hora", "#", "Nome", "Contato", "Convênio", "Tipo", "Status", "Profissional", "Especialidade", "Valor", "Deletado", "Observação"]);
  for (const l of linhas) {
    const [a, m, d] = l.data.split("-");
    ws.addRow([String(l.id), `${d}/${m}/${a}`, l.hora, String(l.pacienteId), l.nome, "", l.convenio, "SESSÃO PSICOLOGIA", l.status ?? "Marcado", "ANA BEATRIZ COSTA", "Psicóloga", l.valor ?? "", l.deletado ? "Sim" : "Não", ""]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const mesDe = (data: string) => data.slice(0, 7);
const nomeDoMes = (data: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(`${data}T12:00:00Z`));

async function enviar(page: Page, arquivo: Buffer) {
  await page.goto("/configuracoes/importar");
  await page.getByLabel("Arquivo do relatório").setInputFiles({ name: "agenda.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: arquivo });
}

test("importar agenda: correspondências, meses, divergência e versão do app mantida", async ({ page }) => {
  const n = Date.now() % 100_000_000;
  const sexta = diaDaSemanaAtual(4);
  const outroMes = new Date(`${sexta}T12:00:00Z`);
  outroMes.setUTCDate(outroMes.getUTCDate() + 35);
  const depois = outroMes.toISOString().slice(0, 10);
  const nomes = { a: `Importado A ${n}`, b: `Importado B ${n}`, c: `Importado C ${n}` };
  const doApp = `Marcado no App ${n}`;
  // Valor novo a cada execução: a correspondência UNIMED + valor ainda não está guardada.
  const valorUnimed = 100 + (n % 800);

  // No app, um atendimento que sobrepõe o importado A (mesma profissional, 17:15).
  await criarAtendimento(page, { nome: doApp, dia: 4, hora: "17:15", profissional: 1 });

  const arquivo = await relatorio([
    { id: n, data: sexta, hora: "17:00", pacienteId: n, nome: nomes.a.toUpperCase(), convenio: "UNIMED", valor: `${valorUnimed},00` },
    { id: n + 1, data: sexta, hora: "07:00", pacienteId: n + 1, nome: nomes.b.toUpperCase(), convenio: `CONVENIO TESTE ${n}` },
    { id: n + 2, data: depois, hora: "09:00", pacienteId: n + 2, nome: nomes.c.toUpperCase(), convenio: "UNIMED" },
    { id: n + 3, data: sexta, hora: "10:00", pacienteId: n + 3, nome: "APAGADO", convenio: "UNIMED", deletado: true },
  ]);

  // 1) Convênio desconhecido: escolher o plano.
  await enviar(page, arquivo);
  const correspondencias = page.getByRole("region", { name: "Correspondências" });
  await expect(correspondencias).toContainText(`CONVENIO TESTE ${n}`);
  // Cada convênio + valor é uma correspondência; a de nome igual já vem sugerida.
  const unimedComValor = correspondencias.getByLabel(new RegExp(`Plano para o convênio UNIMED · R\\$\\s${valorUnimed},00`));
  await expect(unimedComValor.locator("option:checked")).toHaveText("Unimed");
  await correspondencias.getByLabel(`Plano para o convênio CONVENIO TESTE ${n} · sem valor`).selectOption({ label: "Unimed" });
  await correspondencias.getByRole("button", { name: "Continuar" }).click();

  // 2) Resumo por mês (simulado) e importação só do mês da sexta.
  const resumo = page.getByRole("region", { name: "Resumo da importação" });
  const linhaDoMes = (data: string) => resumo.getByRole("row").filter({ hasText: new RegExp(nomeDoMes(data), "i") });
  if (mesDe(sexta) !== mesDe(depois)) {
    await expect(linhaDoMes(depois).getByRole("cell").nth(2)).toHaveText("1"); // novos
    await linhaDoMes(depois).getByRole("checkbox").uncheck();
  }
  await expect(linhaDoMes(sexta).getByRole("cell").nth(2)).toHaveText("2");
  await resumo.getByRole("button", { name: /^Importar 1 mês$/ }).click();
  await expect(page.getByRole("status", { name: "Resultado da importação" })).toContainText("2 novos");

  // 3) Na agenda: os importados aparecem e a sobreposição tem a linha vermelha.
  await page.goto("/agenda");
  await expect(cardDoPaciente(page, nomes.a)).toHaveCount(1);
  await expect(cardDoPaciente(page, nomes.c)).toHaveCount(0); // mês não marcado
  await expect(cardDoPaciente(page, doApp)).toHaveAttribute("data-divergencia", "");
  await expect(cardDoPaciente(page, doApp)).toHaveAttribute("aria-label", /Divergência: mesmo horário que Importado A/);
  const coluna = page.locator("[data-coluna]").filter({ has: page.locator(`button[aria-label*=" · ${doApp} · "]`) });
  // Ao menos a deste par (no banco local, execuções anteriores deixam outros no mesmo horário).
  await expect(coluna.locator("svg[data-linhas-divergencia] line")).not.toHaveCount(0);

  // 4) Modificado no app (desmarcado): numa nova importação, vale a versão do app.
  await cardDoPaciente(page, nomes.b).dispatchEvent("click");
  const detalhes = page.getByRole("dialog", { name: "Detalhes do atendimento" });
  await detalhes.getByRole("button", { name: "Desmarcar" }).click();
  await detalhes.getByRole("radio", { name: "Paciente desmarcou" }).click();
  await detalhes.getByRole("button", { name: "Confirmar desmarcação" }).click();
  await expect(detalhes.getByRole("status")).toContainText("desmarcado");

  await enviar(page, arquivo);
  // A correspondência do convênio ficou guardada: vai direto ao resumo.
  await expect(page.getByRole("region", { name: "Correspondências" })).toHaveCount(0);
  const cells = linhaDoMes(sexta).getByRole("cell");
  await expect(cells.nth(4)).toHaveText("1"); // iguais (A)
  await expect(cells.nth(5)).toHaveText("1"); // mantidos (B, desmarcado no app)
});
