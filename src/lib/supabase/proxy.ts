import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const logado = Boolean(data?.claims);
  const naLogin = request.nextUrl.pathname.startsWith("/login");

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
