import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ArquivoInvalido, capitalizar, chaveCompacta, lerAgendaLegado, lerStatus } from "./agenda-legado";

// Relatório fictício no formato do sistema anterior: títulos antes do cabeçalho,
// "#" repetido (atendimento e paciente).
async function relatorio(linhas: string[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agenda");
  ws.addRow(["Relatório de agendamentos"]);
  ws.addRow([]);
  ws.addRow(["#", "Data Atend", "Hora", "#", "Nome", "Contato", "Convênio", "Tipo", "Status", "Profissional", "Especialidade", "Valor", "Deletado", "Observação"]);
  for (const l of linhas) ws.addRow(l);
  ws.addRow(["Total: 3"]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("lerAgendaLegado", () => {
  it("lê as linhas e ignora rodapé", async () => {
    const r = await lerAgendaLegado(
      await relatorio([
        ["101", "07/10/2026", "8:30", "55", "MARIA DA SILVA", "(49) 9999-0000", "UNIMED", "SESSÃO PSICOLOGIA", "Marcado", "ANA COSTA", "Psicóloga", "", "Não", "Trazer laudo"],
        ["102", "15/11/2026", "14:00", "56", "JOÃO SOUZA", "", "PARTICULAR - TABELA B", "", "DesmarcadoMotivo: Paciente desmarcou", "ANA COSTA", "", "150,00", "Sim", ""],
      ]),
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      idLegado: 101,
      data: "2026-10-07",
      hora: "08:30",
      mes: "2026-10",
      pacienteIdLegado: 55,
      pacienteNome: "Maria da Silva",
      contato: "(49) 9999-0000",
      tipo: "Sessão Psicologia",
      status: "marcado",
      deletado: false,
      observacao: "Trazer laudo",
    });
    expect(r[1]).toMatchObject({ mes: "2026-11", status: "desmarcado", motivo: "Paciente desmarcou", valor: 150, deletado: true, tipo: null });
  });

  it("recusa arquivo sem o cabeçalho esperado", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRow(["a", "b"]);
    await expect(lerAgendaLegado((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(ArquivoInvalido);
    await expect(lerAgendaLegado(new TextEncoder().encode("não é xlsx").buffer as ArrayBuffer)).rejects.toThrow(ArquivoInvalido);
  });
});

describe("normalização", () => {
  it("convênios casam com planos renomeados", () => {
    expect(chaveCompacta("PARTICULAR - TABELA B")).toBe(chaveCompacta("Particular-TabelaB"));
    expect(chaveCompacta("PROJETO NURE COMUNICACAO")).toBe(chaveCompacta("ProjetoNureComunicação"));
  });
  it("status e nomes", () => {
    expect(lerStatus("Atendido")).toEqual({ status: "atendido", motivo: null });
    expect(lerStatus("DesmarcadoMotivo: Feriado")).toEqual({ status: "desmarcado", motivo: "Feriado" });
    expect(capitalizar("SESSÃO DE ABA")).toBe("Sessão de ABA");
  });
});
