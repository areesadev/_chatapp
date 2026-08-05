import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { criarClienteServidor } from '@/lib/supabase/servidor';

/**
 * Destino do magic link. Aceita as duas formas que o Supabase pode enviar:
 *
 * - `token_hash` + `type` — verificação por OTP. Funciona em qualquer
 *   navegador ou aparelho, porque não depende de nada guardado localmente.
 *   É a forma recomendada e a que o template de e-mail deve usar.
 * - `code` — fluxo PKCE. Exige que o link seja aberto no mesmo navegador que
 *   pediu, já que o verifier fica no cookie de quem iniciou.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const tipo = (searchParams.get('type') as EmailOtpType | null) ?? 'magiclink';
  const destinoBruto = searchParams.get('destino');

  // Só caminho interno — evita redirect aberto para domínio externo.
  const destino =
    destinoBruto?.startsWith('/') && !destinoBruto.startsWith('//') ? destinoBruto : '/chat';

  const supabase = await criarClienteServidor();
  let erro: string | null = null;

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    erro = error?.message ?? null;
  } else if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    erro = error?.message ?? null;
  } else {
    erro = 'Link inválido ou incompleto.';
  }

  if (erro) {
    const url = new URL('/login', origin);
    url.searchParams.set('erro', traduzir(erro));
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

function traduzir(mensagem: string): string {
  if (/code verifier|pkce/i.test(mensagem)) {
    return (
      'Este link precisa ser aberto no mesmo navegador em que foi solicitado. ' +
      'Peça um novo link e clique nele no mesmo aparelho — ou avise o administrador ' +
      'para ajustar o template de e-mail do Supabase.'
    );
  }
  if (/expired|invalid|not found/i.test(mensagem)) {
    return 'Link expirado ou já utilizado. Cada link vale por uma hora e só funciona uma vez — peça um novo.';
  }
  return mensagem;
}
