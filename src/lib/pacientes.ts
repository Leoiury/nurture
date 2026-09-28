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
