// Importa os dados do sistema anterior (relatórios .xlsx em dados/) para o Supabase.
//
// Uso:  npm run importar:legado            (grava no banco)
//       npm run importar:legado -- --dry   (só mostra o que seria importado)
//
// Pode ser executado mais de uma vez: pacientes e atendimentos são atualizados
// pelo id_legado; profissionais, planos e tipos pelo nome.
//
// Os arquivos em dados/ contêm dados reais de pacientes e nunca vão para o git.
// Este script imprime apenas contagens, nunca dados pessoais.

import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

const DRY = process.argv.includes("--dry");
const DIR = new URL("../dados/", import.meta.url);
const FUSO = "-03:00"; // America/Sao_Paulo (sem horário de verão desde 2019)

// Planos: cor do card e padrões. Valores seguem a regra informada pela clínica;
// planos sem valor fixo (particular, APAE, AMA...) ficam em branco.
const PLANOS: Record<string, { nome: string; cor: string; duracao: number; valor: number | null }> = {
  "AMA": { nome: "AMA", cor: "#A7C7E7", duracao: 30, valor: null },
  "APAE": { nome: "APAE", cor: "#B5E3C4", duracao: 30, valor: null },
  "PARTICULAR": { nome: "Particular", cor: "#F9D98C", duracao: 45, valor: null },
  "PARTICULAR - TABELA B": { nome: "Particular - Tabela B", cor: "#F5B97F", duracao: 45, valor: 150 },
  "UNIMED": { nome: "Unimed", cor: "#7FC8A9", duracao: 45, valor: 120 },
  "UNIMED - REEMBOLSO": { nome: "Unimed - Reembolso", cor: "#C3B1E1", duracao: 45, valor: 200 },
  "PETROBRAS - REEMBOLSO": { nome: "Petrobrás - Reembolso", cor: "#F4A6A6", duracao: 45, valor: 200 },
  "PROJETO NURE COMUNICACAO": { nome: "Projeto Nure Comunicação", cor: "#9AD0EC", duracao: 45, valor: 115 },
  "REUNIOES E VISITAS": { nome: "Reuniões e Visitas", cor: "#D9D9D9", duracao: 45, valor: null },
};

const STATUS: Record<string, Database["public"]["Enums"]["status_atendimento"]> = {
  ATENDIDO: "atendido",
  MARCADO: "marcado",
  DESMARCADO: "desmarcado",
};

// Utilitários -----------------------------------------------------------------

type Linha = Record<string, string>;

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

function vazio(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" || t === "-" ? null : t;
}

/** Chave de comparação: sem acentos, maiúsculas, espaços simples, sem ponto final. */
function chave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

const MINUSCULAS = new Set(["da", "de", "do", "das", "dos", "e", "com", "os", "as"]);
const SIGLAS = new Set(["ABA", "AMA", "APAE"]);

function capitalizar(s: string): string {
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

/** dd/mm/aaaa -> aaaa-mm-dd */
function dataISO(s: string | null): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function somarMinutos(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60_000).toISOString();
}

/** Lê um relatório: acha a linha de cabeçalho e devolve as linhas de dados (ID numérico na 1ª coluna). */
async function lerRelatorio(arquivo: string, colunaObrigatoria: string): Promise<Linha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fileURLToPath(new URL(arquivo, DIR)));
  const ws = wb.worksheets[0];

  let cabecalho: string[] | null = null;
  const linhas: Linha[] = [];
  ws.eachRow((row) => {
    const valores = (row.values as ExcelJS.CellValue[]).map(texto);
    if (!cabecalho) {
      if (valores.includes(colunaObrigatoria)) cabecalho = valores;
      return;
    }
    if (!/^\d+$/.test(valores[1] ?? "")) return;
    const linha: Linha = {};
    // Colunas repetidas recebem sufixo: "#", "# (2)"...
    cabecalho.forEach((nome, i) => {
      if (!nome) return;
      let k = nome;
      for (let n = 2; k in linha; n++) k = `${nome} (${n})`;
      linha[k] = valores[i] ?? "";
    });
    linhas.push(linha);
  });
  if (!cabecalho) throw new Error(`${arquivo}: cabeçalho com "${colunaObrigatoria}" não encontrado`);
  return linhas;
}

function contar<T>(itens: T[], f: (x: T) => string): Record<string, number> {
  return itens.reduce<Record<string, number>>((acc, x) => {
    const k = f(x);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

// Importação ------------------------------------------------------------------

const agenda = await lerRelatorio("agendamentos_setembro.xlsx", "Profissional");
const pacientesXlsx = await lerRelatorio("pacientes.xlsx", "Convênio");
const validos = agenda.filter((a) => a["Deletado"] === "Não");

console.log(`Agenda: ${agenda.length} registros, ${validos.length} válidos (não deletados)`);
console.log(`Pacientes: ${pacientesXlsx.length}`);

// Planos que aparecem nos dados, mas não estão mapeados acima.
const planosDesconhecidos = new Set(
  [...agenda.map((a) => a["Convênio"]), ...pacientesXlsx.map((p) => p["Convênio"])]
    .filter(Boolean)
    .map(chave)
    .filter((k) => !(k in PLANOS)),
);
if (planosDesconhecidos.size) throw new Error(`Planos não mapeados: ${[...planosDesconhecidos].join(", ")}`);

// Profissionais: todos os que aparecem na agenda (inclusive só em registros deletados).
const profissionais = new Map<string, { nome: string; especialidade: string | null }>();
for (const a of agenda) {
  const k = chave(a["Profissional"]);
  const atual = profissionais.get(k);
  profissionais.set(k, {
    nome: capitalizar(a["Profissional"]),
    especialidade: atual?.especialidade ?? vazio(a["Especialidade"]),
  });
}

const tipos = new Map<string, string>();
for (const a of agenda) if (vazio(a["Tipo"])) tipos.set(chave(a["Tipo"]), capitalizar(a["Tipo"]));

if (DRY) {
  console.log(`\n[dry] ${profissionais.size} profissionais, ${Object.keys(PLANOS).length} planos, ${tipos.size} tipos`);
  console.log("[dry] status:", contar(validos, (a) => a["Status"]));
  console.log("[dry] nada foi gravado.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local");
const db = createClient<Database>(url, secret, { auth: { persistSession: false } });

function ok<T>(r: { data: T | null; error: { message: string } | null }, etapa: string): T {
  if (r.error || r.data === null) throw new Error(`${etapa}: ${r.error?.message ?? "sem retorno"}`);
  return r.data;
}

// Tabelas de apoio, com mapa chave -> id.
const planoId = new Map<string, string>();
for (const p of ok(
  await db
    .from("planos")
    .upsert(
      Object.values(PLANOS).map((p) => ({ nome: p.nome, cor: p.cor, duracao_padrao_min: p.duracao, valor_padrao: p.valor })),
      { onConflict: "nome" },
    )
    .select("id, nome"),
  "planos",
))
  planoId.set(chave(p.nome), p.id);

const profId = new Map<string, string>();
for (const p of ok(
  await db
    .from("profissionais")
    .upsert([...profissionais.values()], { onConflict: "nome", ignoreDuplicates: false })
    .select("id, nome"),
  "profissionais",
))
  profId.set(chave(p.nome), p.id);

const tipoId = new Map<string, string>();
for (const t of ok(
  await db
    .from("tipos_atendimento")
    .upsert([...tipos.values()].map((nome) => ({ nome })), { onConflict: "nome" })
    .select("id, nome"),
  "tipos",
))
  tipoId.set(chave(t.nome), t.id);

const planoDoConvenio = (convenio: string) => planoId.get(chave(PLANOS[chave(convenio)]?.nome ?? "")) ?? null;

// Pacientes.
const pacientes = pacientesXlsx.map((p) => ({
  id_legado: Number(p["#ID Paciente"]),
  nome: capitalizar(p["Nome"]),
  responsavel: vazio(p["Nome da Mãe"]) && capitalizar(p["Nome da Mãe"]),
  data_nascimento: dataISO(vazio(p["Data Nascimento"])),
  cpf: vazio(p["Cpf"])?.replace(/\D/g, "") || null,
  celular: vazio(p["Celular"]),
  email: vazio(p["E-mail"])?.toLowerCase() ?? null,
  endereco: vazio(p["Endereço"]),
  bairro: vazio(p["Bairro"]),
  cidade: vazio(p["Cidade"]) && capitalizar(p["Cidade"]),
  uf: vazio(p["UF"])?.toUpperCase().slice(0, 2) ?? null,
  cep: vazio(p["CEP"]),
  plano_id: planoDoConvenio(p["Convênio"]),
  profissional_responsavel_id: profId.get(chave(p["Prof. Responsável"] ?? "")) ?? null,
  ativo: p["Deletado"] !== "Sim",
}));

const pacId = new Map<number, string>();
for (const p of ok(
  await db.from("pacientes").upsert(pacientes, { onConflict: "id_legado" }).select("id, id_legado"),
  "pacientes",
))
  pacId.set(p.id_legado!, p.id);

// Atendimentos (apenas os não deletados).
const semPaciente: string[] = [];
const atendimentos = validos.map((a) => {
  const plano = PLANOS[chave(a["Convênio"])];
  const inicio = new Date(`${dataISO(a["Data Atend"])}T${a["Hora"]}:00${FUSO}`).toISOString();
  // No relatório de agenda, "#" é o ID do atendimento e "# (2)" o ID do paciente.
  const pacienteId = pacId.get(Number(a["# (2)"])) ?? null;
  if (!pacienteId) semPaciente.push(a["#"]);
  const valorPlanilha = vazio(a["Valor"]);
  return {
    id_legado: Number(a["#"]),
    profissional_id: profId.get(chave(a["Profissional"]))!,
    paciente_id: pacienteId,
    plano_id: planoDoConvenio(a["Convênio"]),
    tipo_id: tipoId.get(chave(a["Tipo"])) ?? null,
    inicio,
    fim: somarMinutos(inicio, plano.duracao),
    valor: valorPlanilha ? Number(valorPlanilha.replace(",", ".")) : plano.valor,
    status: STATUS[chave(a["Status"]).replace(/MOTIVO.*$/, "").trim()] ?? "marcado",
    // Ex.: "DesmarcadoMotivo: Paciente desmarcou" -> observação "Paciente desmarcou"
    observacao: a["Status"].match(/Motivo:\s*(.+)$/)?.[1] ?? null,
  };
});

for (let i = 0; i < atendimentos.length; i += 500) {
  ok(
    await db.from("atendimentos").upsert(atendimentos.slice(i, i + 500), { onConflict: "id_legado" }).select("id"),
    "atendimentos",
  );
}

console.log("\nImportado:");
console.log(`  profissionais: ${profId.size}`);
console.log(`  planos:        ${planoId.size}`);
console.log(`  tipos:         ${tipoId.size}`);
console.log(`  pacientes:     ${pacId.size} (${pacientes.filter((p) => !p.ativo).length} inativos)`);
console.log(`  atendimentos:  ${atendimentos.length}`, contar(atendimentos, (a) => a.status));
if (semPaciente.length) console.log(`  atenção: ${semPaciente.length} atendimentos sem paciente correspondente`);
