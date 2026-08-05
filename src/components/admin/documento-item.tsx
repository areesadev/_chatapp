'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ROTULO_SIGILO,
  ROTULO_STATUS,
  ROTULO_TIPO_DOCUMENTO,
  ROTULO_VIGENCIA,
  type Documento,
  type NivelSigilo,
  type VigenciaDocumento,
} from '@/lib/tipos';

interface Props {
  documento: Documento;
  ocupado: boolean;
  aoReindexar: (id: string) => void;
}

export function DocumentoItem({ documento, ocupado, aoReindexar }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [titulo, setTitulo] = useState(documento.titulo);
  const [descricao, setDescricao] = useState(documento.descricao ?? '');
  const [sigilo, setSigilo] = useState<NivelSigilo>(documento.sigilo);
  const [vigencia, setVigencia] = useState<VigenciaDocumento>(documento.vigencia);
  const [dataReferencia, setDataReferencia] = useState(documento.data_referencia ?? '');
  const [tags, setTags] = useState(documento.tags.join(', '));

  const alterado =
    titulo !== documento.titulo ||
    descricao !== (documento.descricao ?? '') ||
    sigilo !== documento.sigilo ||
    vigencia !== documento.vigencia ||
    dataReferencia !== (documento.data_referencia ?? '') ||
    tags !== documento.tags.join(', ');

  async function salvar() {
    setSalvando(true);
    setErro(null);

    const resposta = await fetch(`/api/documentos/${documento.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo,
        descricao,
        sigilo,
        vigencia,
        dataReferencia: dataReferencia || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    });

    setSalvando(false);

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      setErro(corpo.erro ?? 'Não foi possível salvar.');
      return;
    }

    setAberto(false);
    router.refresh();
  }

  async function apagar() {
    if (!confirm(`Apagar "${documento.titulo}" e todos os seus fragmentos?`)) return;
    await fetch(`/api/documentos/${documento.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <li className="rounded-2xl border border-borda bg-superficie">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={aberto}
        >
          <span
            className={`mt-1 shrink-0 text-texto-tenue transition-transform ${aberto ? 'rotate-90' : ''}`}
            aria-hidden
          >
            ›
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{documento.titulo}</span>
            <span className="mt-1 block text-sm text-texto-tenue">
              {ROTULO_TIPO_DOCUMENTO[documento.tipo]}
              {' · '}
              <Estado status={documento.status} />
              {documento.total_fragmentos > 0 && ` · ${documento.total_fragmentos} fragmentos`}
              {' · '}
              {ROTULO_SIGILO[documento.sigilo]}
              {documento.vigencia !== 'vigente' && ` · ${ROTULO_VIGENCIA[documento.vigencia]}`}
              {documento.data_referencia && ` · ref. ${formatarData(documento.data_referencia)}`}
            </span>
            {documento.erro_msg && (
              <span className="mt-2 block text-sm leading-snug text-alerta">
                {documento.erro_msg}
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => aoReindexar(documento.id)}
            disabled={ocupado}
            className="botao-mini"
          >
            Reindexar
          </button>
          <button type="button" onClick={apagar} className="botao-mini text-alerta">
            Apagar
          </button>
        </div>
      </div>

      {aberto && (
        <div className="space-y-5 border-t border-borda p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="rotulo" htmlFor={`titulo-${documento.id}`}>
                Título
              </label>
              <input
                id={`titulo-${documento.id}`}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label className="rotulo" htmlFor={`descricao-${documento.id}`}>
                Descrição
              </label>
              <input
                id={`descricao-${documento.id}`}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Para que serve, quem produziu"
                className="campo"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="rotulo" htmlFor={`sigilo-${documento.id}`}>
                Sigilo
              </label>
              <select
                id={`sigilo-${documento.id}`}
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
              <label className="rotulo" htmlFor={`vigencia-${documento.id}`}>
                Vigência
              </label>
              <select
                id={`vigencia-${documento.id}`}
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
              <label className="rotulo" htmlFor={`data-${documento.id}`}>
                Data de referência
              </label>
              <input
                id={`data-${documento.id}`}
                type="date"
                value={dataReferencia}
                onChange={(e) => setDataReferencia(e.target.value)}
                className="campo"
              />
            </div>

            <div>
              <label className="rotulo" htmlFor={`tags-${documento.id}`}>
                Tags (vírgula)
              </label>
              <input
                id={`tags-${documento.id}`}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm text-texto-tenue sm:grid-cols-2">
            <Info rotulo="Cadastrado em" valor={formatarDataHora(documento.criado_em)} />
            <Info
              rotulo="Indexado em"
              valor={documento.indexado_em ? formatarDataHora(documento.indexado_em) : 'nunca'}
            />
            {documento.fonte_url && <Info rotulo="Origem" valor={documento.fonte_url} />}
            {documento.tamanho_bytes && (
              <Info rotulo="Tamanho" valor={formatarTamanho(documento.tamanho_bytes)} />
            )}
          </dl>

          {sigilo === 'confidencial' && (
            <p className="text-sm text-atencao">
              Confidencial nunca é enviado a modelos gratuitos, nem a usuários com nível de
              acesso menor.
            </p>
          )}

          {erro && (
            <p role="alert" className="text-sm text-alerta">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !alterado}
              className="botao botao-primario"
            >
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <span className="text-sm text-texto-tenue">
              Sigilo, vigência, data e tags valem na hora — só o conteúdo exige reindexar.
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0">{rotulo}:</dt>
      <dd className="min-w-0 truncate text-texto-suave">{valor}</dd>
    </div>
  );
}

function Estado({ status }: { status: Documento['status'] }) {
  const cor =
    status === 'erro' ? 'text-alerta' : status === 'indexado' ? 'text-texto-suave' : 'text-atencao';

  return <span className={cor}>{ROTULO_STATUS[status]}</span>;
}

/** A coluna é `date`; interpretar como UTC evita cair no dia anterior. */
function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
