// Nome de usuário: o Supabase Auth exige e-mail, então o login sem e-mail guarda um
// endereço interno, que não recebe nada e não aparece na tela.

const DOMINIO_INTERNO = "login.nurture.invalid";

export const normalizarUsuario = (texto: string) => texto.trim().toLowerCase();

export const usuarioValido = (usuario: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario);

export const emailInterno = (usuario: string) => `${usuario}@${DOMINIO_INTERNO}`;

export const ehEmailInterno = (email: string) => email.endsWith(`@${DOMINIO_INTERNO}`);

/** Como a pessoa entra: o nome de usuário ou, nos logins antigos, o e-mail. */
export const identificacaoDoLogin = (u: { usuario: string | null; email: string }) => u.usuario ?? u.email;
