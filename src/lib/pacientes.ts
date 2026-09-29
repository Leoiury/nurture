// Utilidades de pacientes.

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

/** "7 anos e 4 meses", "11 meses" — a partir de AAAA-MM-DD, na data de referência (hoje). */
export function idade(nascimento: string, referencia: Date = new Date()): string {
  const [a, m, d] = nascimento.split("-").map(Number);
  let anos = referencia.getFullYear() - a;
  let meses = referencia.getMonth() + 1 - m;
  if (referencia.getDate() < d) meses--;
  if (meses < 0) {
    anos--;
    meses += 12;
  }
  if (anos <= 0) return plural(Math.max(meses, 0), "mês", "meses");
  return plural(anos, "ano", "anos") + (meses ? ` e ${plural(meses, "mês", "meses")}` : "");
}

/** Forma para comparar em buscas: minúsculas e sem acentos ("João" → "joao"). */
export function paraBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** 12345678901 → 123.456.789-01 (outros formatos voltam como vieram). */
export function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

/** Nível do cadastro (calculado no banco a partir do que falta preencher). */
export type NivelCadastral = "completo" | "falta_informacao" | "critico";

export const NIVEIS_CADASTRAIS: {
  valor: NivelCadastral;
  rotulo: string;
  descricao: string;
  /** Classes: ponto/barra, fundo da linha e selo. */
  cor: { marca: string; fundo: string; selo: string };
}[] = [
  { valor: "completo", rotulo: "Completo", descricao: "Nada faltando", cor: { marca: "bg-emerald-500", fundo: "bg-emerald-50", selo: "bg-emerald-100 text-emerald-800" } },
  { valor: "falta_informacao", rotulo: "Falta informação", descricao: "Faltam 1 ou 2 itens", cor: { marca: "bg-amber-400", fundo: "bg-amber-50", selo: "bg-amber-100 text-amber-900" } },
  { valor: "critico", rotulo: "Crítico", descricao: "Faltam 3 ou mais itens", cor: { marca: "bg-red-500", fundo: "bg-red-50", selo: "bg-red-100 text-red-800" } },
];

export const nivelCadastral = (valor: NivelCadastral) => NIVEIS_CADASTRAIS.find((n) => n.valor === valor)!;
