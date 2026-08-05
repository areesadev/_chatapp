import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const ROTAS_PUBLICAS = ['/login', '/auth', '/acesso-pendente'];

/**
 * Renova a sessão a cada request e barra quem não está logado.
 *
 * A checagem de `ativo` fica no layout de /(app), não aqui: exigiria uma
 * consulta ao banco em toda requisição, inclusive assets.
 */
export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesParaDefinir) => {
          for (const { name, value } of cookiesParaDefinir) {
            request.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesParaDefinir) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida o token no servidor — não confie em getSession() aqui.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  const ehPublica = ROTAS_PUBLICAS.some((rota) => caminho.startsWith(rota));

  // Rotas de API cuidam da própria autenticação e respondem em JSON. Redirecioná-las
  // aqui devolveria HTML de login para um `fetch`, que quebra ao tentar dar parse.
  if (caminho.startsWith('/api/')) {
    return resposta;
  }

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('destino', caminho);
    return NextResponse.redirect(url);
  }

  if (user && caminho === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return resposta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
