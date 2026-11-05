// Nome de usuário: a pessoa entra com ele ou com o e-mail, que o cadastro exige.

export const normalizarUsuario = (texto: string) => texto.trim().toLowerCase();

export const usuarioValido = (usuario: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario);

/**
 * Sugere um nome de usuário a partir do nome do profissional: tira acentos e apóstrofos,
 * e troca espaços e outros caracteres não aceitos por ponto. Nome longo demais perde as
 * últimas palavras. Sem sugestão possível, devolve vazio.
 */
export function sugerirUsuario(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/[._-]*\.[._-]*/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
  const curto = base.length <= 30 ? base : (base.slice(0, 31).match(/^(.*)\./)?.[1] ?? base.slice(0, 30));
  const sugestao = curto.replace(/[._-]+$/, "");
  return usuarioValido(sugestao) ? sugestao : "";
}

/** Como a pessoa entra: o nome de usuário ou, nos logins antigos, o e-mail. */
export const identificacaoDoLogin = (u: { usuario: string | null; email: string }) => u.usuario ?? u.email;
