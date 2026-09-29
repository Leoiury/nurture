// Leitura do relatório de agendamentos do sistema anterior (.xlsx, um ou vários
// meses). Só lê e normaliza: casar com pacientes, planos e profissionais do app
// fica com a ação de importação.

import ExcelJS from "exceljs";
import type { Status } from "@/lib/agenda/dados";

export type LinhaLegado = {
  idLegado: number;
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM
  mes: string; // AAAA-MM
  pacienteIdLegado: number | null;
  pacienteNome: string;
  contato: string | null;
  convenio: string;
  tipo: string | null;
  status: Status;
  motivo: string | null;
  profissional: string;
  especialidade: string | null;
  valor: number | null;
  deletado: boolean;
  observacao: string | null;
};

/** Chave de nomes: sem acentos, maiúsculas, espaços simples, sem ponto final. */
export function chave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

/** Chave de convênios/planos: só letras e números ("Particular - Tabela B" = "Particular-TabelaB"). */
export const chaveCompacta = (s: string) => chave(s).replace(/[^A-Z0-9]/g, "");

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e", "com", "os", "as"]);
const SIGLAS = new Set(["ABA", "AMA", "APAE"]);

export function capitalizar(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((p, i) => {
      if (SIGLAS.has(p.toUpperCase())) return p.toUpperCase();
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

const STATUS: Record<string, Status> = {
  ATENDIDO: "atendido",
  MARCADO: "marcado",
  DESMARCADO: "desmarcado",
  CONFIRMADO: "confirmado",
  FALTOU: "faltou",
  FALTA: "faltou",
};

/** "DesmarcadoMotivo: Paciente desmarcou" → desmarcado + motivo. */
export function lerStatus(s: string): { status: Status; motivo: string | null } {
  const motivo = s.match(/Motivo:\s*(.+)$/i)?.[1]?.trim() || null;
  const base = chave(s.replace(/Motivo:.*$/i, ""));
  return { status: STATUS[base] ?? "marcado", motivo: STATUS[base] === "desmarcado" ? motivo : null };
}

function texto(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result ?? "");
    return "";
  }
  return String(v).trim();
}

const vazio = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" || t === "-" ? null : t;
};

/** Colunas que o relatório precisa ter. */
const OBRIGATORIAS = ["#", "Data Atend", "Hora", "Nome", "Convênio", "Status", "Profissional", "Deletado"];

export class ArquivoInvalido extends Error {}

/** Lê o relatório (primeira planilha). Linhas sem ID numérico são ignoradas. */
export async function lerAgendaLegado(conteudo: ArrayBuffer): Promise<LinhaLegado[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(conteudo);
  } catch {
    throw new ArquivoInvalido("Não foi possível abrir o arquivo: envie o relatório em .xlsx.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ArquivoInvalido("O arquivo não tem planilhas.");

  let cabecalho: string[] | null = null;
  const linhas: LinhaLegado[] = [];
  ws.eachRow((row) => {
    const valores = (row.values as ExcelJS.CellValue[]).map(texto);
    if (!cabecalho) {
      if (valores.includes("Profissional") && valores.includes("Data Atend")) cabecalho = valores;
      return;
    }
    if (!/^\d+$/.test(valores[1] ?? "")) return;
    // Colunas repetidas ("#" do atendimento e "#" do paciente) recebem sufixo: "#", "# (2)".
    const c: Record<string, string> = {};
    (cabecalho as string[]).forEach((nome, i) => {
      if (!nome) return;
      let k = nome;
      for (let n = 2; k in c; n++) k = `${nome} (${n})`;
      c[k] = valores[i] ?? "";
    });

    const data = c["Data Atend"].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const hora = c["Hora"].match(/^(\d{1,2}):(\d{2})/);
    if (!data || !hora) return;
    const { status, motivo } = lerStatus(c["Status"]);
    const valor = vazio(c["Valor"]);
    linhas.push({
      idLegado: Number(c["#"]),
      data: `${data[3]}-${data[2]}-${data[1]}`,
      hora: `${hora[1].padStart(2, "0")}:${hora[2]}`,
      mes: `${data[3]}-${data[2]}`,
      pacienteIdLegado: /^\d+$/.test(c["# (2)"] ?? "") ? Number(c["# (2)"]) : null,
      pacienteNome: capitalizar(c["Nome"]),
      contato: vazio(c["Contato"]),
      convenio: c["Convênio"].trim(),
      tipo: vazio(c["Tipo"]) && capitalizar(c["Tipo"]),
      status,
      motivo,
      profissional: c["Profissional"].trim(),
      especialidade: vazio(c["Especialidade"]),
      valor: valor ? Number(valor.replace(/\./g, "").replace(",", ".")) : null,
      deletado: chave(c["Deletado"]) === "SIM",
      observacao: vazio(c["Observação"]),
    });
  });
  if (!cabecalho) throw new ArquivoInvalido(`Cabeçalho não encontrado: o relatório precisa das colunas ${OBRIGATORIAS.join(", ")}.`);
  const faltando = OBRIGATORIAS.filter((col) => !(cabecalho as string[]).includes(col));
  if (faltando.length) throw new ArquivoInvalido(`Faltam colunas no relatório: ${faltando.join(", ")}.`);
  return linhas;
}
