import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CABECALHO_SEM_LOGIN_AUTOMATICO, COOKIE_LOGIN_MANUAL, credenciaisDoLoginAutomatico } from "@/lib/auth/login-automatico";

// Renova o token de sessão do Supabase a cada requisição.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Não coloque código entre createServerClient e getClaims().
  const { data } = await supabase.auth.getClaims();
  let logado = Boolean(data?.claims);
  const naLogin = request.nextUrl.pathname.startsWith("/login");

  // Ambiente de testes local: entra sozinho com o usuário de teste (ver login-automatico.ts).
  // "?automatico" na tela de login volta a ligá-lo depois de "Sair".
  const credenciais = logado ? null : credenciaisDoLoginAutomatico();
  const religar = naLogin && request.nextUrl.searchParams.has("automatico");
  if (credenciais && !request.headers.has(CABECALHO_SEM_LOGIN_AUTOMATICO) && (religar || !request.cookies.has(COOKIE_LOGIN_MANUAL))) {
    const { error } = await supabase.auth.signInWithPassword({ email: credenciais.email, password: credenciais.senha });
    logado = !error;
    if (logado && religar) response.cookies.delete(COOKIE_LOGIN_MANUAL);
  }

  // Verificação otimista; as páginas protegidas conferem a sessão de novo no servidor.
  if (!logado && !naLogin) return redirecionar(request, response, "/login");
  if (logado && naLogin) return redirecionar(request, response, "/agenda");

  return response;
}

// Redireciona preservando os cookies de sessão que o Supabase possa ter renovado.
function redirecionar(request: NextRequest, response: NextResponse, caminho: string) {
  const url = request.nextUrl.clone();
  url.pathname = caminho;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
