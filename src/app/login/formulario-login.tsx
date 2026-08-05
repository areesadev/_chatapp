'use client';

import { useState } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/client';

export function FormularioLogin({ destino }: { destino: string }) {
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'enviado'>('parado');
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEstado('enviando');

    try {
      // criarClienteNavegador lança (não devolve erro) quando as variáveis
      // NEXT_PUBLIC_ não entraram no build — sem o try, o formulário congela
      // em "Enviando…" sem dizer nada.
      const supabase = criarClienteNavegador();
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('destino', destino);

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: callback.toString() },
      });

      if (error) {
        setErro(traduzir(error.message));
        setEstado('parado');
        return;
      }

      setEstado('enviado');
    } catch (falha) {
      setErro(traduzir(falha instanceof Error ? falha.message : 'Falha inesperada no login.'));
      setEstado('parado');
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Link enviado para <strong>{email}</strong>.
        </p>
        <p className="text-sm text-texto-suave">
          Abra o e-mail e clique no link para entrar. Ele vale por uma hora e só pode ser
          usado uma vez.
        </p>
        <button
          type="button"
          onClick={() => setEstado('parado')}
          className="text-sm underline underline-offset-2 text-texto-suave hover:text-texto"
        >
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm text-texto-suave">
          E-mail corporativo
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@areesa.com.br"
          className="campo"
        />
      </div>

      {erro && (
        <p role="alert" className="text-sm text-alerta">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={estado === 'enviando'}
        className="botao botao-primario w-full"
      >
        {estado === 'enviando' ? 'Enviando…' : 'Receber link de acesso'}
      </button>

      <p className="text-sm text-texto-tenue">
        O acesso é por convite. Se o seu e-mail ainda não foi cadastrado, fale com o
        administrador da agência.
      </p>
    </form>
  );
}

/**
 * Traduz só os erros que sabemos reconhecer com precisão; o resto passa cru.
 *
 * A versão anterior casava qualquer mensagem contendo "invalid" ou "email" e
 * devolvia "E-mail inválido" — o que transformava chave malformada, provedor
 * desligado e limite de envio no mesmo diagnóstico errado.
 */
function traduzir(mensagem: string): string {
  // O limite do SMTP embutido do Supabase é por PROJETO e por hora, somando
  // todos os e-mails. Dizer "muitas tentativas" faria o usuário achar que o
  // problema foram os cliques dele.
  if (/rate limit|too many requests/i.test(mensagem)) {
    return (
      'O servidor de e-mail atingiu o limite da hora. Esse limite é do projeto ' +
      'inteiro, não das suas tentativas — configure um SMTP próprio no Supabase ' +
      'para removê-lo. Enquanto isso, aguarde até a virada da hora.'
    );
  }
  if (/url and key are required|invalid api key|no api key/i.test(mensagem)) {
    return 'Configuração do Supabase ausente ou incorreta neste ambiente. Confira as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.';
  }
  if (/signups? (are )?(not allowed|disabled)|email logins are disabled/i.test(mensagem)) {
    return 'O login por e-mail está desativado no Supabase (Authentication → Providers).';
  }
  if (/unable to validate email|invalid format|is invalid/i.test(mensagem)) {
    return 'E-mail inválido.';
  }
  return mensagem;
}
