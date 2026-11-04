// Nome de usuário: a pessoa entra com ele ou com o e-mail, que o cadastro exige.

export const normalizarUsuario = (texto: string) => texto.trim().toLowerCase();

export const usuarioValido = (usuario: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario);

/** Como a pessoa entra: o nome de usuário ou, nos logins antigos, o e-mail. */
export const identificacaoDoLogin = (u: { usuario: string | null; email: string }) => u.usuario ?? u.email;
