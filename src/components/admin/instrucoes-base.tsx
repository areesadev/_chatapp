'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Contexto permanente da agência, injetado em toda conversa.
 *
 * Fica aqui, e não em Configurações, porque é a moldura que dá sentido aos
 * documentos: sem saber o que é a Areesa e como tratar a base, o agente lê os
 * trechos recuperados como texto solto.
 */
export function InstrucoesBase({ valorInicial }: { valorInicial: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(valorInicial);
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'salvo'>('parado');
  const [erro, setErro] = useState<string | null>(null);

  const alterado = texto !== valorInicial;
  const incompleto = texto.includes('COMPLETE AS SEÇÕES ABAIXO');

  async function salvar() {
    setEstado('salvando');
    setErro(null);

    const resposta = await fetch('/api/configuracoes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'contexto_agencia', valor: texto }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      setErro(corpo.erro ?? 'Não foi possível salvar.');
      setEstado('parado');
      return;
    }

    setEstado('salvo');
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start justify-between gap-4 p-6 text-left"
        aria-expanded={aberto}
      >
        <div className="space-y-1.5">
          <h2 className="text-lg font-medium">Instruções principais</h2>
          <p className="text-sm leading-relaxed text-texto-suave">
            O que é a Areesa e como o agente deve usar a base. Entra em toda conversa, antes
            de qualquer documento.
          </p>
          {incompleto && (
            <p className="text-sm text-atencao">
              Ainda com as seções de exemplo — preencher isso é o que mais melhora a
              qualidade das respostas.
            </p>
          )}
        </div>
        <span
          className={`mt-1 shrink-0 text-texto-tenue transition-transform ${aberto ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ›
        </span>
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-borda p-6">
          <textarea
            rows={20}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setEstado('parado');
            }}
            className="campo resize-y font-mono text-sm leading-relaxed"
          />

          {erro && (
            <p role="alert" className="text-sm text-alerta">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={salvar}
              disabled={estado === 'salvando' || !alterado}
              className="botao botao-primario"
            >
              {estado === 'salvando' ? 'Salvando…' : 'Salvar instruções'}
            </button>

            {estado === 'salvo' && !alterado && (
              <span className="text-sm text-texto-suave">
                Salvo. Vale para as próximas mensagens, sem precisar recarregar.
              </span>
            )}

            <span className="text-sm text-texto-tenue">Aceita markdown</span>
          </div>
        </div>
      )}
    </section>
  );
}
