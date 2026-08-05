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
      <div className="flex items-center justify-between border-b border-borda px-4 py-3 md:hidden">
        <Marca />
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          className="rounded-md border border-borda px-2.5 py-1.5 text-xs"
          aria-expanded={aberta}
        >
          {aberta ? 'Fechar' : 'Conversas'}
        </button>
      </div>

      <aside
        className={`${aberta ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-borda
                    bg-superficie md:flex md:w-72 md:border-r`}
      >
        <div className="hidden px-4 py-4 md:block">
          <Marca />
        </div>

        <div className="px-3 pb-2 pt-3 md:pt-0">
          <Link
            href="/chat"
            onClick={() => setAberta(false)}
            className="block rounded-lg bg-inverso-fundo px-3 py-2 text-center text-sm
                       font-medium text-inverso-texto transition-opacity hover:opacity-90"
          >
            Nova conversa
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {conversas.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-texto-tenue">
              Nenhuma conversa ainda.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversas.map((conversa) => {
                const ativa = caminho === `/chat/${conversa.id}`;
                return (
                  <li key={conversa.id} className="group relative">
                    <Link
                      href={`/chat/${conversa.id}`}
                      onClick={() => setAberta(false)}
                      className={`block truncate rounded-md py-2 pl-2.5 pr-9 text-sm transition-colors
                                  ${ativa ? 'bg-superficie-alta font-medium' : 'hover:bg-superficie-alta'}`}
                      title={conversa.titulo}
                    >
                      {conversa.titulo}
                    </Link>
                    <button
                      type="button"
                      onClick={() => apagar(conversa.id, conversa.titulo)}
                      disabled={removendo === conversa.id}
                      aria-label={`Apagar conversa ${conversa.titulo}`}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1.5 py-1
                                 text-xs text-texto-tenue opacity-0 transition
                                 hover:text-alerta focus-visible:opacity-100 group-hover:opacity-100
                                 disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <div className="space-y-2.5 border-t border-borda px-4 py-3">
          {perfil.papel === 'master' && (
            <Link
              href="/admin/base"
              onClick={() => setAberta(false)}
              className="block rounded-md py-1.5 text-xs text-texto-suave hover:text-texto"
            >
              Administração
            </Link>
          )}

          {limite > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-texto-tenue">
                <span>Consumo do mês</span>
                <span>
                  US$ {gastoDoMes.toFixed(2)} / {limite.toFixed(2)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-superficie-alta">
                <div
                  className="h-full bg-texto-suave transition-all"
                  style={{ width: `${proporcao * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{perfil.nome ?? perfil.email}</p>
              <p className="text-[11px] text-texto-tenue">{ROTULO_PAPEL[perfil.papel]}</p>
            </div>
            <button
              type="button"
              onClick={sair}
              className="shrink-0 text-[11px] text-texto-tenue underline underline-offset-2 hover:text-texto"
            >
              Sair
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
