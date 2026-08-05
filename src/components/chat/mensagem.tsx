'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

import type { Citacao } from '@/lib/tipos';

export interface MensagemVisivel {
  id: string;
  papel: 'user' | 'assistant';
  conteudo: string;
  raciocinio?: string | null;
  erro?: string | null;
  modelo?: string | null;
  citacoes?: Citacao[];
}

export function Mensagem({
  mensagem,
  gerando = false,
}: {
  mensagem: MensagemVisivel;
  gerando?: boolean;
}) {
  if (mensagem.papel === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-superficie-alta
                     px-4 py-2.5 text-sm leading-relaxed"
        >
          {mensagem.conteudo}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mensagem.raciocinio && <Raciocinio texto={mensagem.raciocinio} />}

      {mensagem.conteudo && (
        <div className="prosa text-sm">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Tabela larga rola dentro do próprio bloco; a página nunca rola lateralmente.
              table: ({ children }) => (
                <div className="tabela-rolavel">
                  <table>{children}</table>
                </div>
              ),
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {mensagem.conteudo}
          </Markdown>
          {gerando && <span className="cursor-digitando ml-0.5" aria-hidden />}
        </div>
      )}

      {gerando && !mensagem.conteudo && !mensagem.raciocinio && (
        <p className="text-sm text-texto-tenue">
          Pensando<span className="cursor-digitando ml-1" aria-hidden />
        </p>
      )}

      {mensagem.citacoes && mensagem.citacoes.length > 0 && (
        <Fontes citacoes={mensagem.citacoes} />
      )}

      {/* Exportação só depois que a mensagem existe no banco — id local não serve. */}
      {!gerando && mensagem.conteudo && !mensagem.id.startsWith('local-') && (
        <Exportar mensagemId={mensagem.id} />
      )}

      {mensagem.erro && (
        <p role="alert" className="rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-alerta">
          {mensagem.erro}
        </p>
      )}
    </div>
  );
}

const FORMATOS = [
  { id: 'docx', rotulo: 'Word' },
  { id: 'xlsx', rotulo: 'Excel' },
  { id: 'pdf', rotulo: 'PDF' },
] as const;

function Exportar({ mensagemId }: { mensagemId: string }) {
  const [gerandoFormato, setGerandoFormato] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar(formato: string) {
    setGerandoFormato(formato);
    setErro(null);

    try {
      const resposta = await fetch('/api/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagemId, formato }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro ?? 'Falha ao gerar o arquivo.');
      }

      // Content-Disposition traz o nome; extraímos para nomear o download.
      const disposicao = resposta.headers.get('Content-Disposition') ?? '';
      const nome = disposicao.match(/filename="(.+?)"/)?.[1] ?? `resposta.${formato}`;

      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao exportar.');
    } finally {
      setGerandoFormato(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-texto-tenue">Exportar:</span>
      {FORMATOS.map((formato) => (
        <button
          key={formato.id}
          type="button"
          onClick={() => exportar(formato.id)}
          disabled={gerandoFormato !== null}
          className="rounded border border-borda px-2 py-0.5 text-[11px] text-texto-suave
                     transition-colors hover:bg-superficie hover:text-texto disabled:opacity-40"
        >
          {gerandoFormato === formato.id ? 'Gerando…' : formato.rotulo}
        </button>
      ))}
      {erro && <span className="text-[11px] text-alerta">{erro}</span>}
    </div>
  );
}

/** Documentos da base consultados para esta resposta, na ordem das citações [n]. */
function Fontes({ citacoes }: { citacoes: Citacao[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-texto-suave hover:text-texto"
        aria-expanded={aberto}
      >
        <span className={`transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
        {citacoes.length} {citacoes.length === 1 ? 'fonte consultada' : 'fontes consultadas'}
      </button>

      {aberto && (
        <ol className="space-y-2.5 border-t border-borda px-3 py-2.5">
          {citacoes.map((citacao, indice) => (
            <li key={`${citacao.documento_id}-${indice}`} className="text-xs">
              <span className="font-medium">
                [{indice + 1}] {citacao.titulo}
              </span>
              <p className="mt-0.5 leading-relaxed text-texto-suave">{citacao.trecho}…</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Raciocinio({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-lg border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-texto-suave hover:text-texto"
        aria-expanded={aberto}
      >
        <span className={`transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
        Raciocínio
      </button>
      {aberto && (
        <div className="whitespace-pre-wrap border-t border-borda px-3 py-2.5 text-xs leading-relaxed text-texto-suave">
          {texto}
        </div>
      )}
    </div>
  );
}
