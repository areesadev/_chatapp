'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Marca } from '@/components/marca';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { ROTULO_PAPEL, type Conversa, type Perfil } from '@/lib/tipos';

interface Props {
  perfil: Perfil;
  conversas: Conversa[];
  gastoDoMes: number;
}

export function BarraLateral({ perfil, conversas, gastoDoMes }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  async function sair() {
    await criarClienteNavegador().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function apagar(id: string, titulo: string) {
    if (!confirm(`Apagar "${titulo}"? Isso remove a conversa e todas as mensagens dela.`)) return;

    setRemovendo(id);
    const resposta = await fetch(`/api/conversas/${id}`, { method: 'DELETE' });
    setRemovendo(null);

    if (!resposta.ok) {
      alert('Não foi possível apagar a conversa.');
      return;
    }

    if (caminho === `/chat/${id}`) router.push('/chat');
    router.refresh();
  }

  const limite = Number(perfil.limite_mensal_usd);
  const proporcao = limite > 0 ? Math.min(gastoDoMes / limite, 1) : 0;

  return (
    <>
      {/* Cabeçalho móvel */}
      <div className="flex items-center justify-between border-b border-borda px-5 py-4 md:hidden">
        <Marca />
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          className="botao-mini"
          aria-expanded={aberta}
        >
          {aberta ? 'Fechar' : 'Conversas'}
        </button>
      </div>

      <aside
        className={`${aberta ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-borda
                    bg-superficie md:flex md:w-80 md:border-r`}
      >
        <div className="hidden px-5 py-5 md:block">
          <Marca />
        </div>

        <div className="px-4 pb-3 pt-4 md:pt-0">
          <Link
            href="/chat"
            onClick={() => setAberta(false)}
            className="botao botao-primario w-full"
          >
            Nova conversa
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {conversas.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-texto-tenue">
              Nenhuma conversa ainda.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversas.map((conversa) => {
                const ativa = caminho === `/chat/${conversa.id}`;
                return (
                  <li key={conversa.id} className="group relative">
                    <Link
                      href={`/chat/${conversa.id}`}
                      onClick={() => setAberta(false)}
                      className={`flex min-h-[3rem] items-center truncate rounded-xl py-3 pl-4 pr-12
                                  text-sm transition-colors
                                  ${ativa ? 'bg-superficie-alta font-medium' : 'hover:bg-superficie-alta'}`}
                      title={conversa.titulo}
                    >
                      <span className="truncate">{conversa.titulo}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => apagar(conversa.id, conversa.titulo)}
                      disabled={removendo === conversa.id}
                      aria-label={`Apagar conversa ${conversa.titulo}`}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center
                                 justify-center rounded-lg text-texto-tenue opacity-0 transition
                                 hover:bg-superficie hover:text-alerta focus-visible:opacity-100
                                 group-hover:opacity-100 disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="space-y-4 border-t border-borda px-5 py-4">
          {perfil.papel === 'master' && (
            <Link
              href="/admin/base"
              onClick={() => setAberta(false)}
              className="block text-sm text-texto-suave transition-colors hover:text-texto"
            >
              Administração
            </Link>
          )}

          {limite > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-texto-tenue" data-numerico>
                <span>Consumo do mês</span>
                <span>
                  US$ {gastoDoMes.toFixed(2)} / {limite.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-superficie-alta">
                <div
                  className="h-full bg-texto-suave transition-all"
                  style={{ width: `${proporcao * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{perfil.nome ?? perfil.email}</p>
              <p className="text-sm text-texto-tenue">{ROTULO_PAPEL[perfil.papel]}</p>
            </div>
            <button
              type="button"
              onClick={sair}
              className="shrink-0 text-sm text-texto-tenue transition-colors hover:text-texto"
            >
              Sair
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
