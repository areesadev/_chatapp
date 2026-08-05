'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef, useState } from 'react';
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

interface Props {
  mensagem: MensagemVisivel;
  gerando?: boolean;
  /** Reenvia a partir desta mensagem do usuário, com o texto editado. */
  aoEditar?: (mensagemId: string, novoTexto: string) => void;
  /** Descarta esta resposta e gera outra a partir da mesma pergunta. */
  aoRefazer?: () => void;
  bloqueado?: boolean;
}

/** Id gerado no cliente ainda não existe no banco — nada de editar ou exportar. */
const ehLocal = (id: string) => id.startsWith('local-');

export function Mensagem({ mensagem, gerando = false, aoEditar, aoRefazer, bloqueado }: Props) {
  if (mensagem.papel === 'user') {
    return (
      <MensagemUsuario
        mensagem={mensagem}
        aoEditar={aoEditar}
        bloqueado={bloqueado}
      />
    );
  }

  return (
    <div className="space-y-3">
      {mensagem.raciocinio && <Recolhivel titulo="Raciocínio" texto={mensagem.raciocinio} />}

      {mensagem.conteudo && (
        <div className="prosa">
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
          {gerando && <span className="cursor-digitando ml-1" aria-hidden />}
        </div>
      )}

      {gerando && !mensagem.conteudo && !mensagem.raciocinio && (
        <p className="text-texto-tenue">
          Pensando<span className="cursor-digitando ml-1.5" aria-hidden />
        </p>
      )}

      {mensagem.citacoes && mensagem.citacoes.length > 0 && (
        <Fontes citacoes={mensagem.citacoes} />
      )}

      {mensagem.erro && (
        <p role="alert" className="rounded-xl border border-borda bg-superficie px-4 py-3 text-alerta">
          {mensagem.erro}
        </p>
      )}

      {!gerando && mensagem.conteudo && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {aoRefazer && (
            <button type="button" onClick={aoRefazer} disabled={bloqueado} className="botao-mini">
              Refazer resposta
            </button>
          )}
          {!ehLocal(mensagem.id) && <Exportar mensagemId={mensagem.id} />}
        </div>
      )}
    </div>
  );
}

/* ─── Mensagem do usuário, com edição inline ──────────────────────────────── */

function MensagemUsuario({
  mensagem,
  aoEditar,
  bloqueado,
}: {
  mensagem: MensagemVisivel;
  aoEditar?: (mensagemId: string, novoTexto: string) => void;
  bloqueado?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(mensagem.conteudo);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editando) return;
    const campo = campoRef.current;
    if (!campo) return;
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
    campo.style.height = 'auto';
    campo.style.height = `${campo.scrollHeight}px`;
  }, [editando]);

  function confirmar() {
    const texto = rascunho.trim();
    if (!texto || texto === mensagem.conteudo) {
      setEditando(false);
      setRascunho(mensagem.conteudo);
      return;
    }
    setEditando(false);
    aoEditar?.(mensagem.id, texto);
  }

  function cancelar() {
    setRascunho(mensagem.conteudo);
    setEditando(false);
  }

  if (editando) {
    return (
      <div className="space-y-3">
        <textarea
          ref={campoRef}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              confirmar();
            }
            if (e.key === 'Escape') cancelar();
          }}
          className="campo max-h-[420px] resize-none leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={confirmar} className="botao botao-primario">
            Salvar e reenviar
          </button>
          <button type="button" onClick={cancelar} className="botao botao-secundario">
            Cancelar
          </button>
          <span className="text-sm text-texto-tenue">
            As respostas seguintes serão substituídas
          </span>
        </div>
      </div>
    );
  }

  const podeEditar = aoEditar && !ehLocal(mensagem.id);

  return (
    <div className="group flex flex-col items-end gap-1.5">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-lg bg-superficie-alta px-5 py-3.5 leading-relaxed">
        {mensagem.conteudo}
      </div>
      {podeEditar && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          disabled={bloqueado}
          className="botao-mini opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          Editar
        </button>
      )}
    </div>
  );
}

/* ─── Exportação ──────────────────────────────────────────────────────────── */

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
    <>
      {FORMATOS.map((formato) => (
        <button
          key={formato.id}
          type="button"
          onClick={() => exportar(formato.id)}
          disabled={gerandoFormato !== null}
          className="botao-mini"
        >
          {gerandoFormato === formato.id ? 'Gerando…' : formato.rotulo}
        </button>
      ))}
      {erro && <span className="text-sm text-alerta">{erro}</span>}
    </>
  );
}

/* ─── Blocos recolhíveis ──────────────────────────────────────────────────── */

function Recolhivel({ titulo, texto }: { titulo: string; texto: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-xl border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-texto-suave
                   transition-colors hover:text-texto"
        aria-expanded={aberto}
      >
        <span className={`transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
        {titulo}
      </button>
      {aberto && (
        <div className="whitespace-pre-wrap border-t border-borda px-4 py-3.5 text-sm leading-relaxed text-texto-suave">
          {texto}
        </div>
      )}
    </div>
  );
}

/** Documentos da base consultados para esta resposta, na ordem das citações [n]. */
function Fontes({ citacoes }: { citacoes: Citacao[] }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-xl border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-texto-suave
                   transition-colors hover:text-texto"
        aria-expanded={aberto}
      >
        <span className={`transition-transform ${aberto ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
        {citacoes.length} {citacoes.length === 1 ? 'fonte consultada' : 'fontes consultadas'}
      </button>

      {aberto && (
        <ol className="space-y-4 border-t border-borda px-4 py-3.5">
          {citacoes.map((citacao, indice) => (
            <li key={`${citacao.documento_id}-${indice}`} className="text-sm">
              <span className="font-medium">
                [{indice + 1}] {citacao.titulo}
              </span>
              <p className="mt-1 leading-relaxed text-texto-suave">{citacao.trecho}…</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
