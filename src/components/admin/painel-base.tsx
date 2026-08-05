'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { InstrucoesBase } from './instrucoes-base';
import { DocumentoItem } from './documento-item';
import {
  ROTULO_SIGILO,
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
  instrucoes: string;
}

interface Aviso {
  tipo: 'ok' | 'erro' | 'progresso';
  texto: string;
}

export function PainelBase({ documentos, resumo, instrucoes }: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<TipoDocumento>('arquivo');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sigilo, setSigilo] = useState<NivelSigilo>('interno');
  const [vigencia, setVigencia] = useState<VigenciaDocumento>('vigente');
  const [dataReferencia, setDataReferencia] = useState('');
  const [tags, setTags] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [conteudo, setConteudo] = useState('');
  const [url, setUrl] = useState('');

  function limpar() {
    setTitulo('');
    setDescricao('');
    setDataReferencia('');
    setTags('');
    setArquivos([]);
    setConteudo('');
    setUrl('');
  }

  const metadados = () => ({
    descricao,
    sigilo,
    vigencia,
    dataReferencia: dataReferencia || null,
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
  });

  async function cadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setAviso(null);
    setOcupado(true);

    try {
      if (aba === 'arquivo') {
        if (arquivos.length === 0) throw new Error('Escolha ao menos um arquivo.');
        await cadastrarArquivos();
      } else {
        const id = await registrar({
          titulo: titulo.trim() || url,
          tipo: aba,
          conteudo: aba === 'texto' ? conteudo : null,
          fonteUrl: aba === 'link' ? url.trim() : null,
        });
        limpar();
        router.refresh();
        await indexar({ documentoId: id });
      }
    } catch (erro) {
      setAviso({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Falha inesperada.' });
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Sobe e indexa um arquivo por vez.
   *
   * Em série, e não em paralelo: cada indexação chama a OpenAI e o Storage, e
   * disparar dez de uma vez esbarra em limite de requisição dos dois lados.
   */
  async function cadastrarArquivos() {
    const falhas: string[] = [];

    for (const [indice, arquivo] of arquivos.entries()) {
      setAviso({
        tipo: 'progresso',
        texto: `Enviando ${indice + 1} de ${arquivos.length}: ${arquivo.name}`,
      });

      try {
        const storagePath = await enviarArquivo(arquivo);
        const id = await registrar({
          // Com vários arquivos, o título de cada um é o próprio nome; o campo
          // Título só vale quando é um arquivo só.
          titulo: (arquivos.length === 1 && titulo.trim()) || semExtensao(arquivo.name),
          tipo: 'arquivo',
          storagePath,
          mime: arquivo.type || null,
          tamanhoBytes: arquivo.size,
        });

        setAviso({
          tipo: 'progresso',
          texto: `Indexando ${indice + 1} de ${arquivos.length}: ${arquivo.name}`,
        });

        const resultado = await chamarProcessar({ documentoId: id });
        const erro = resultado.resultados?.find((r) => r.erro)?.erro;
        if (erro) falhas.push(`${arquivo.name}: ${erro}`);
      } catch (erro) {
        falhas.push(`${arquivo.name}: ${erro instanceof Error ? erro.message : 'falhou'}`);
      }
    }

    limpar();
    router.refresh();

    setAviso(
      falhas.length === 0
        ? { tipo: 'ok', texto: `${arquivos.length} documento(s) indexado(s).` }
        : { tipo: 'erro', texto: falhas.join(' · ') },
    );
  }

  async function registrar(dados: Record<string, unknown>): Promise<string> {
    const resposta = await fetch('/api/documentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...metadados(), ...dados }),
    });

    const corpo = await resposta.json();
    if (!resposta.ok) throw new Error(corpo.erro ?? 'Falha ao cadastrar.');
    return corpo.id as string;
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

    const { error } = await criarClienteNavegador()
      .storage.from(dados.bucket)
      .uploadToSignedUrl(dados.caminho, dados.token, file);

    if (error) throw new Error(`falha no upload — ${error.message}`);
    return dados.caminho;
  }

  async function chamarProcessar(corpo: Record<string, unknown>) {
    const resposta = await fetch('/api/documentos/processar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });

    return (await resposta.json()) as {
      resultados?: Array<{ titulo: string; erro?: string }>;
      restantes?: number;
      enfileirados?: number;
      erro?: string;
    };
  }

  async function indexar(corpo: Record<string, unknown> = {}) {
    setOcupado(true);
    try {
      const resultado = await chamarProcessar(corpo);
      const falhou = resultado.resultados?.find((r) => r.erro);
      setAviso(
        falhou
          ? { tipo: 'erro', texto: falhou.erro! }
          : { tipo: 'ok', texto: 'Indexação concluída.' },
      );
    } catch {
      setAviso({ tipo: 'erro', texto: 'Falha ao acionar a indexação.' });
    } finally {
      setOcupado(false);
      router.refresh();
    }
  }

  /**
   * Recoloca tudo na fila e processa em lotes até zerar.
   *
   * Em lotes porque a Vercel corta a função em 60s — reindexar a base inteira
   * numa requisição só estouraria o tempo e deixaria documentos pela metade.
   */
  async function reindexarTudo() {
    if (
      !confirm(
        `Reindexar os ${resumo.total} documentos? Cada um é reprocessado do zero e ` +
          'gera novos embeddings, o que consome créditos da OpenAI.',
      )
    )
      return;

    setOcupado(true);
    setAviso({ tipo: 'progresso', texto: 'Enfileirando…' });

    try {
      const inicio = await chamarProcessar({ todos: true });
      const total = inicio.enfileirados ?? 0;
      const falhas: string[] = [];

      let restantes = total;
      let voltas = 0;

      while (restantes > 0 && voltas < 200) {
        setAviso({
          tipo: 'progresso',
          texto: `Reindexando… ${total - restantes} de ${total}`,
        });

        const lote = await chamarProcessar({});
        for (const r of lote.resultados ?? []) {
          if (r.erro) falhas.push(`${r.titulo}: ${r.erro}`);
        }

        const anterior = restantes;
        restantes = lote.restantes ?? 0;
        voltas++;

        // Nenhum avanço significa erro persistente — parar evita laço infinito.
        if (restantes >= anterior) break;
      }

      router.refresh();
      setAviso(
        falhas.length === 0
          ? { tipo: 'ok', texto: `${total} documento(s) reindexado(s).` }
          : { tipo: 'erro', texto: `Com falhas — ${falhas.join(' · ')}` },
      );
    } catch {
      setAviso({ tipo: 'erro', texto: 'Falha ao reindexar.' });
    } finally {
      setOcupado(false);
    }
  }

  const corDoAviso =
    aviso?.tipo === 'erro' ? 'text-alerta' : aviso?.tipo === 'progresso' ? 'text-atencao' : 'text-texto-suave';

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Base de conhecimento</h1>
        <p className="text-sm text-texto-suave">
          {resumo.total} {resumo.total === 1 ? 'documento' : 'documentos'} ·{' '}
          {resumo.totalFragmentos} fragmentos indexados
          {resumo.pendentes > 0 && ` · ${resumo.pendentes} na fila`}
          {resumo.comErro > 0 && ` · ${resumo.comErro} com erro`}
        </p>
      </header>

      <InstrucoesBase valorInicial={instrucoes} />

      {/* ─── Cadastro ─── */}
      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <div className="mb-5 flex gap-2">
          {(['arquivo', 'texto', 'link'] as TipoDocumento[]).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setAba(tipo)}
              className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                aba === tipo
                  ? 'bg-inverso-fundo text-inverso-texto'
                  : 'text-texto-suave hover:bg-superficie-alta'
              }`}
            >
              {ROTULO_TIPO_DOCUMENTO[tipo]}
            </button>
          ))}
        </div>

        <form onSubmit={cadastrar} className="space-y-5">
          {aba === 'arquivo' && (
            <div>
              <label className="rotulo" htmlFor="arquivo">
                Arquivos — PDF, DOCX, XLSX, XLS, CSV, TXT, MD ou JSON
              </label>
              <input
                id="arquivo"
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json"
                onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
                className="campo file:mr-4 file:rounded-lg file:border-0 file:bg-superficie-alta
                           file:px-4 file:py-2 file:text-sm"
              />

              {arquivos.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-texto-suave">
                  {arquivos.map((a) => (
                    <li key={a.name} className="truncate">
                      {a.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-texto-tenue">
                  Dá para selecionar vários de uma vez. PDF escaneado como imagem não é lido —
                  nesses casos, use a aba Texto.
                </p>
              )}

              {arquivos.length > 1 && (
                <p className="mt-2 text-sm text-texto-tenue">
                  Cada arquivo vira um documento com o próprio nome como título. Sigilo,
                  vigência, data e tags abaixo valem para todos.
                </p>
              )}
            </div>
          )}

          {aba === 'texto' && (
            <div>
              <label className="rotulo" htmlFor="conteudo">
                Conteúdo — transcrição de reunião, diretriz, aprendizado
              </label>
              <textarea
                id="conteudo"
                rows={8}
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                placeholder="Cole aqui o texto que deve entrar na base…"
                className="campo resize-y"
              />
            </div>
          )}

          {aba === 'link' && (
            <div>
              <label className="rotulo" htmlFor="url">
                URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://areesa.com.br/manifesto"
                className="campo"
              />
              <p className="mt-2 text-sm text-texto-tenue">
                Páginas que só renderizam por JavaScript retornam vazio — use a aba Texto.
              </p>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor="titulo">
                Título {arquivos.length > 1 && '(ignorado com vários arquivos)'}
              </label>
              <input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                disabled={arquivos.length > 1}
                placeholder={arquivos[0]?.name ?? 'Planejamento 2026'}
                className="campo"
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="descricao">
                Descrição (opcional)
              </label>
              <input
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="rotulo" htmlFor="sigilo">
                Sigilo
              </label>
              <select
                id="sigilo"
                value={sigilo}
                onChange={(e) => setSigilo(e.target.value as NivelSigilo)}
                className="campo"
              >
                {(Object.keys(ROTULO_SIGILO) as NivelSigilo[]).map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SIGILO[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="rotulo" htmlFor="vigencia">
                Vigência
              </label>
              <select
                id="vigencia"
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value as VigenciaDocumento)}
                className="campo"
              >
                {(Object.keys(ROTULO_VIGENCIA) as VigenciaDocumento[]).map((v) => (
                  <option key={v} value={v}>
                    {ROTULO_VIGENCIA[v]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="rotulo" htmlFor="data">
                Data de referência
              </label>
              <input
                id="data"
                type="date"
                value={dataReferencia}
                onChange={(e) => setDataReferencia(e.target.value)}
                className="campo"
              />
              <p className="mt-2 text-sm text-texto-tenue">Em branco, assume hoje</p>
            </div>

            <div>
              <label className="rotulo" htmlFor="tags">
                Tags (vírgula)
              </label>
              <input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="processo, cliente"
                className="campo"
              />
            </div>
          </div>

          {sigilo === 'confidencial' && (
            <p className="text-sm text-atencao">
              Documento confidencial nunca é enviado a modelos gratuitos, nem para usuários
              com nível de acesso menor.
            </p>
          )}

          {aviso && <p className={`text-sm ${corDoAviso}`}>{aviso.texto}</p>}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={ocupado} className="botao botao-primario">
              {ocupado
                ? 'Processando…'
                : arquivos.length > 1
                  ? `Adicionar ${arquivos.length} arquivos`
                  : 'Adicionar e indexar'}
            </button>

            {resumo.pendentes > 0 && (
              <button
                type="button"
                onClick={() => indexar()}
                disabled={ocupado}
                className="botao botao-secundario"
              >
                Processar fila ({resumo.pendentes})
              </button>
            )}
          </div>
        </form>
      </section>

      {/* ─── Lista ─── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Documentos</h2>
          {resumo.total > 0 && (
            <button
              type="button"
              onClick={reindexarTudo}
              disabled={ocupado}
              className="botao botao-secundario"
            >
              Reindexar tudo
            </button>
          )}
        </div>

        {documentos.length === 0 ? (
          <p className="rounded-2xl border border-borda bg-superficie px-6 py-10 text-center text-sm text-texto-suave">
            A base está vazia. Comece pelo planejamento vigente e pelas transcrições das
            últimas reuniões de diretoria — é o que o agente mais vai precisar.
          </p>
        ) : (
          <ul className="space-y-3">
            {documentos.map((documento) => (
              <DocumentoItem
                key={documento.id}
                documento={documento}
                ocupado={ocupado}
                aoReindexar={(id) => indexar({ documentoId: id })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function semExtensao(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto > 0 ? nome.slice(0, ponto) : nome;
}
