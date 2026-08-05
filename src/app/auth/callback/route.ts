import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { criarClienteServidor } from '@/lib/supabase/servidor';

/**
 * Destino do magic link. Aceita as duas formas que o Supabase pode enviar:
 * `code` (fluxo PKCE, padrão) e `token_hash` + `type` (templates de e-mail
 * customizados).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const tipo = searchParams.get('type') as EmailOtpType | null;
  const destino = searchParams.get('destino') ?? '/chat';

  const supabase = await criarClienteServidor();
  let erro: string | null = null;

  if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    erro = error?.message ?? null;
  } else if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    erro = error?.message ?? null;
  } else {
    erro = 'Link inválido ou incompleto.';
  }

  if (erro) {
    const url = new URL('/login', origin);
    url.searchParams.set('erro', erro);
    return NextResponse.redirect(url);
  }

  // Perfil sem convite nasce inativo — desvia para a tela de espera.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('ativo')
      .eq('id', user.id)
      .maybeSingle();

    if (!perfil?.ativo) {
      return NextResponse.redirect(new URL('/acesso-pendente', origin));
    }
  }

  return NextResponse.redirect(new URL(destino, origin));
}
