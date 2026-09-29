// Tipos de atendimento: quem atende e qual tipo sugerir para um profissional.

/** `profissionais`: ids vinculados ao tipo. Nenhum vinculado: qualquer profissional atende. */
export type TipoComProfissionais = { id: string; nome: string; profissionais: string[]; /** Qual valor do plano o tipo usa. */ area?: string | null };

export function atendeOTipo(tipo: Pick<TipoComProfissionais, "profissionais">, profissionalId: string): boolean {
  return tipo.profissionais.length === 0 || tipo.profissionais.includes(profissionalId);
}

/** Profissionais que atendem o tipo (sem tipo, ou tipo sem vínculos: todos). */
export function profissionaisDoTipo<P extends { id: string }>(vinculados: string[] | null, profissionais: P[]): P[] {
  if (!vinculados?.length) return profissionais;
  return profissionais.filter((p) => vinculados.includes(p.id));
}

// Especialidade → palavra do nome do tipo; desempata quando o profissional atende vários tipos.
const PALAVRA_POR_ESPECIALIDADE: [RegExp, string][] = [
  [/psic[óo]log/i, "psicologia"],
  [/fono|estagi/i, "fono"],
  [/pedag|neuro/i, "pedag"],
  [/nutri/i, "nutri"],
];

/**
 * Tipo sugerido ao escolher o primeiro profissional: o único tipo vinculado a ele;
 * se houver vários, o que combina com a especialidade (senão o primeiro).
 * Sem vínculos, nada é sugerido.
 */
export function tipoSugerido(profissional: { id: string; especialidade: string | null } | undefined, tipos: TipoComProfissionais[]): string | null {
  if (!profissional) return null;
  const dele = tipos.filter((t) => t.profissionais.includes(profissional.id));
  if (dele.length <= 1) return dele[0]?.id ?? null;
  const palavra = PALAVRA_POR_ESPECIALIDADE.find(([re]) => profissional.especialidade && re.test(profissional.especialidade))?.[1];
  return (palavra && dele.find((t) => t.nome.toLowerCase().includes(palavra))?.id) || dele[0].id;
}
