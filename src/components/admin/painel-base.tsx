'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/client';
import {
  ROTULO_SIGILO,
  ROTULO_STATUS,
  ROTULO_TIPO_DOCUMENTO,
  ROTULO_VIGENCIA,
  type Documento,
  type NivelSigilo,
  type TipoDocumento,
  type VigenciaDocumento,
} from '@/lib/tipos';

interface Props {
  documentos: Documento[];
  resumo: { total: number; totalFragmentos: number; pendentes: number; comErro: number };
}

export function PainelBase({ documentos, resumo }: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<TipoDocumento>('arquivo');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Campos comuns do formulário
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sigilo, setSigilo] = useState<NivelSigilo>('interno');
  const [vigencia, setVigencia] = useState<VigenciaDocumento>('vigente');
  const [dataReferencia, setDataReferencia] = useState('');
  const [tags, setTags] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conteudo, setConteudo] = useState('');
  const [url, setUrl] = useState('');

  function limpar() {
    setTitulo('');
    setDescricao('');
    setDataReferencia('');
    setTags('');
    setArquivo(null);
    setConteudo('');
    setUrl('');
  }

  async function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setAviso(null);
    setOcupado(true);

    try {
      let storagePath: string | null = null;

      if (aba === 'arquivo') {
        if (!arquivo) throw new Error('Escolha um arquivo.');
        storagePath = await enviarArquivo(arquivo);
      }

      const resposta = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim() || arquivo?.name || url,
          tipo: aba,
          descricao,
          sigilo,
          vigencia,
          dataReferencia: dataReferencia || null,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          storagePath,
          mime: arquivo?.type ?? null,
          tamanhoBytes: arquivo?.size ?? null,
          conteudo: aba === 'texto' ? conteudo : null,
          fonteUrl: aba === 'link' ? url.trim() : null,
        }),
      });

      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? 'Falha ao cadastrar.');

      setAviso({ tipo: 'ok', texto: 'Cadastrado. Indexando…' });
      limpar();
      router.refresh();

      await indexar(corpo.id);
    } catch (erro) {
      setAviso({
        tipo: 'erro',
        texto: erro instanceof Error ? erro.message : 'Falha inesperada.',
      });
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Envia direto ao Storage com URL assinada. O arquivo não passa pela rota de
   * API porque o limite de corpo da Vercel (4,5 MB) barraria PDFs e planilhas.
   */
  async function enviarArquivo(file: File): Promise<string> {
    const preparo = await fetch('/api/documentos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeArquivo: file.name }),
    });

    const dados = await preparo.json();
    if (!preparo.ok) throw new Error(dados.erro ?? 'Falha ao preparar o upload.');

    const supabase = criarClienteNavegador();
    const { error } = await supabase.storage
      .from(dados.bucket)
      .uploadToSignedUrl(dados.caminho, dados.token, file);

    if (error) throw new Error(`Falha no upload: ${error.message}`);
    return dados.caminho;
  }

  async function indexar(documentoId?: string) {
    setOcupado(true);
    try {
      const resposta = await fetch('/api/documentos/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentoId ? { documentoId } : {}),
      });

      const corpo = await resposta.json();
      const falhou = corpo.resultados?.find((r: { erro?: string }) => r.erro);

      setAviso(
        falhou
          ? { tipo: 'erro', texto: falhou.erro }
          : { tipo: 'ok', texto: 'Indexação concluída.' },
      );
    } catch {
      setAviso({ tipo: 'erro', texto: 'Falha ao acionar a indexação.' });
    } finally {
      setOcupado(false);
      router.refresh();
    }
  }

  async function alterar(id: string, alteracoes: Record<string, unknown>) {
    await fetch(`/api/documentos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alteracoes),
    });
    router.refresh();
  }

  async function apagar(documento: Documento) {
    if (!confirm(`Apagar "${documento.titulo}" e todos os seus fragmentos?`)) return;
    await fetch(`/api/documentos/${documento.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Base de conhecimento</h1>
        <p className="text-sm text-texto-suave">
          {resumo.total} {resumo.total === 1 ? 'documento' : 'documentos'} ·{' '}
          {resumo.totalFragmentos} fragmentos indexados
          {resumo.pendentes > 0 && ` · ${resumo.pendentes} na fila`}
          {resumo.comErro > 0 && ` · ${resumo.comErro} com erro`}
        </p>
      </header>

      {/* ─── Cadastro ─── */}
      <section className="rounded-xl border border-borda bg-superficie p-4">
        <div className="mb-4 flex gap-1">
          {(['arquivo', 'texto', 'link'] as TipoDocumento[]).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setAba(tipo)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                aba === tipo
                  ? 'bg-inverso-fundo text-inverso-texto'
                  : 'text-texto-suave hover:bg-superficie-alta'
              }`}
            >
              {ROTULO_TIPO_DOCUMENTO[tipo]}
            </button>
          ))}
        </div>

        <form onSubmit={cadastrar} className="space-y-3">
          {aba === 'arquivo' && (
            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="arquivo">
                Arquivo — PDF, DOCX, XLSX, XLS, CSV, TXT, MD ou JSON
              </label>
              <input
                id="arquivo"
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm
                           file:mr-3 file:rounded file:border-0 file:bg-superficie-alta
                           file:px-3 file:py-1 file:text-xs"
              />
              <p className="mt-1 text-[11px] text-texto-tenue">
                PDF escaneado como imagem não é lido — nesses casos, use a aba Texto.
              </p>
            </div>
          )}

          {aba === 'texto' && (
            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="conteudo">
                Conteúdo — transcrição de reunião, diretriz, aprendizado
              </label>
              <textarea
                id="conteudo"
                rows={7}
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Cole aqui o texto que deve entrar na base…"
                className="w-full resize-y rounded-lg border border-borda bg-fundo px-3 py-2 text-sm
                           placeholder:text-texto-tenue"
              />
            </div>
          )}

          {aba === 'link' && (
            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="url">
                URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://areesa.com.br/manifesto"
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm
                           placeholder:text-texto-tenue"
              />
              <p className="mt-1 text-[11px] text-texto-tenue">
                Páginas que só renderizam por JavaScript retornam vazio — use a aba Texto.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Título" htmlFor="titulo">
              <input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={arquivo?.name ?? 'Planejamento 2026'}
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              />
            </Campo>

            <Campo rotulo="Descrição (opcional)" htmlFor="descricao">
              <input
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              />
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Campo rotulo="Sigilo" htmlFor="sigilo">
              <select
                id="sigilo"
                value={sigilo}
                onChange={(e) => setSigilo(e.target.value as NivelSigilo)}
                className="w-full rounded-lg border border-borda bg-fundo px-2 py-2 text-sm"
              >
                {(Object.keys(ROTULO_SIGILO) as NivelSigilo[]).map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SIGILO[s]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Vigência" htmlFor="vigencia">
              <select
                id="vigencia"
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value as VigenciaDocumento)}
                className="w-full rounded-lg border border-borda bg-fundo px-2 py-2 text-sm"
              >
                {(Object.keys(ROTULO_VIGENCIA) as VigenciaDocumento[]).map((v) => (
                  <option key={v} value={v}>
                    {ROTULO_VIGENCIA[v]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Data de referência" htmlFor="data">
              <input
                id="data"
                type="date"
                value={dataReferencia}
                onChange={(e) => setDataReferencia(e.target.value)}
                className="w-full rounded-lg border border-borda bg-fundo px-2 py-2 text-sm"
              />
            </Campo>

            <Campo rotulo="Tags (vírgula)" htmlFor="tags">
              <input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="processo, cliente"
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              />
            </Campo>
          </div>

          {sigilo === 'confidencial' && (
            <p className="text-[11px] text-atencao">
              Documento confidencial nunca é enviado a modelos gratuitos, nem para usuários
              com nível de acesso menor.
            </p>
          )}

          {aviso && (
            <p className={`text-xs ${aviso.tipo === 'erro' ? 'text-alerta' : 'text-texto-suave'}`}>
              {aviso.texto}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={ocupado}
              className="rounded-lg bg-inverso-fundo px-4 py-2 text-sm font-medium text-inverso-texto
                         transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {ocupado ? 'Processando…' : 'Adicionar e indexar'}
            </button>

            {resumo.pendentes > 0 && (
              <button
                type="button"
                onClick={() => indexar()}
                disabled={ocupado}
                className="rounded-lg border border-borda px-4 py-2 text-sm hover:bg-superficie-alta
                           disabled:opacity-50"
              >
                Processar fila ({resumo.pendentes})
              </button>
            )}
          </div>

          <div>
            {resumo.pendentes > 0 && (
              <p className="text-[11px] text-texto-tenue">
                A indexação roda ao cadastrar. Este botão é para retomar o que ficou para
                trás — o cron automático só passa uma vez por dia.
              </p>
            )}
          </div>
        </form>
      </section>

      {/* ─── Lista ─── */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Documentos</h2>

        {documentos.length === 0 ? (
          <p className="rounded-xl border border-borda bg-superficie px-4 py-8 text-center text-sm text-texto-suave">
            A base está vazia. Comece pelo planejamento vigente e pelas transcrições das
            últimas reuniões de diretoria — é o que o agente mais vai precisar.
          </p>
        ) : (
          <ul className="space-y-2">
            {documentos.map((documento) => (
              <li
                key={documento.id}
                className="rounded-xl border border-borda bg-superficie p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{documento.titulo}</p>
                    <p className="mt-0.5 text-[11px] text-texto-tenue">
                      {ROTULO_TIPO_DOCUMENTO[documento.tipo]}
                      {' · '}
                      <Estado status={documento.status} />
                      {documento.total_fragmentos > 0 &&
                        ` · ${documento.total_fragmentos} fragmentos`}
                      {documento.data_referencia && ` · ref. ${documento.data_referencia}`}
                    </p>
                    {documento.erro_msg && (
                      <p className="mt-1 text-[11px] leading-snug text-alerta">
                        {documento.erro_msg}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={documento.sigilo}
                      onChange={(e) => alterar(documento.id, { sigilo: e.target.value })}
                      aria-label={`Sigilo de ${documento.titulo}`}
                      className="rounded border border-borda bg-fundo px-1.5 py-1 text-[11px]"
                    >
                      {(Object.keys(ROTULO_SIGILO) as NivelSigilo[]).map((s) => (
                        <option key={s} value={s}>
                          {ROTULO_SIGILO[s]}
                        </option>
                      ))}
                    </select>

                    <select
                      value={documento.vigencia}
                      onChange={(e) => alterar(documento.id, { vigencia: e.target.value })}
                      aria-label={`Vigência de ${documento.titulo}`}
                      className="rounded border border-borda bg-fundo px-1.5 py-1 text-[11px]"
                    >
                      {(Object.keys(ROTULO_VIGENCIA) as VigenciaDocumento[]).map((v) => (
                        <option key={v} value={v}>
                          {ROTULO_VIGENCIA[v]}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => indexar(documento.id)}
                      disabled={ocupado}
                      className="rounded border border-borda px-2 py-1 text-[11px] hover:bg-superficie-alta
                                 disabled:opacity-40"
                    >
                      Reindexar
                    </button>

                    <button
                      type="button"
                      onClick={() => apagar(documento)}
                      className="rounded border border-borda px-2 py-1 text-[11px] text-alerta
                                 hover:bg-superficie-alta"
                    >
                      Apagar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Campo({
  rotulo,
  htmlFor,
  children,
}: {
  rotulo: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-texto-suave" htmlFor={htmlFor}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}

function Estado({ status }: { status: Documento['status'] }) {
  const cor =
    status === 'erro' ? 'text-alerta' : status === 'indexado' ? 'text-texto-suave' : 'text-atencao';

  return <span className={cor}>{ROTULO_STATUS[status]}</span>;
}
