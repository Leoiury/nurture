// Login automático do ambiente de testes LOCAL: sem sessão, o proxy entra com o
// usuário de teste. Só liga com as três condições juntas — `next dev`, Supabase em
// 127.0.0.1/localhost e as credenciais no .env.development.local (gravadas por
// scripts/ambiente-local.mjs). Na produção, nenhuma delas existe.

/** Depois de "Sair": o formulário volta a valer até fechar o navegador (cookie de sessão). */
export const COOKIE_LOGIN_MANUAL = "nurture-login-manual";
/** Os testes automáticos fazem o login pelo formulário: este cabeçalho desliga o automático. */
export const CABECALHO_SEM_LOGIN_AUTOMATICO = "x-nurture-sem-login-automatico";

type Ambiente = { NODE_ENV?: string; NEXT_PUBLIC_SUPABASE_URL?: string; LOGIN_AUTOMATICO_EMAIL?: string; LOGIN_AUTOMATICO_SENHA?: string };

export function credenciaisDoLoginAutomatico(env: Ambiente = process.env): { email: string; senha: string } | null {
  if (env.NODE_ENV !== "development") return null;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) return null;
  if (!env.LOGIN_AUTOMATICO_EMAIL || !env.LOGIN_AUTOMATICO_SENHA) return null;
  return { email: env.LOGIN_AUTOMATICO_EMAIL, senha: env.LOGIN_AUTOMATICO_SENHA };
}
