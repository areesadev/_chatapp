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
          className="w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm
                     placeholder:text-texto-tenue focus:outline-none focus:ring-2 focus:ring-texto"
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
        className="w-full rounded-lg bg-inverso-fundo px-3 py-2.5 text-sm font-medium
                   text-inverso-texto transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {estado === 'enviando' ? 'Enviando…' : 'Receber link de acesso'}
      </button>

      <p className="text-xs text-texto-tenue">
        O acesso é por convite. Se o seu e-mail ainda não foi cadastrado, fale com o
        administrador da agência.
      </p>
    </form>
  );
}

function traduzir(mensagem: string): string {
  if (/rate limit|too many/i.test(mensagem)) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  }
  if (/invalid|email/i.test(mensagem)) {
    return 'E-mail inválido.';
  }
  return mensagem;
}
