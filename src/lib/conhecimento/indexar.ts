import { criarClienteAdmin } from '@/lib/supabase/admin';
import { extrairDeUrl, extrairTexto } from './extrair';
import { fragmentar } from './fragmentar';
import { gerarEmbeddings, paraVetorPg } from './embeddings';

const BUCKET = 'documentos';

/** Acima disso, "processando" significa que a execução morreu no meio. */
const MINUTOS_ATE_CONSIDERAR_TRAVADO = 15;

export interface ResultadoIndexacao {
  documentoId: string;
  titulo: string;
  fragmentos: number;
  erro?: string;
}

/**
 * Extrai, fragmenta e vetoriza um documento.
 *
 * Roda com a chave secreta porque é acionado por cron além do painel — não há
 * sessão de usuário no caminho do worker.
 */
export async function indexarDocumento(documentoId: string): Promise<ResultadoIndexacao> {
  const admin = criarClienteAdmin();

  const { data: documento, error: erroLeitura } = await admin
    .from('documentos')
    .select('*')
    .eq('id', documentoId)
    .maybeSingle();

  if (erroLeitura || !documento) {
    return { documentoId, titulo: '—', fragmentos: 0, erro: 'Documento não encontrado.' };
  }

  await admin
    .from('documentos')
    .update({ status: 'processando', erro_msg: null })
    .eq('id', documentoId);

  try {
    const texto = await obterTexto(documento);

    if (!texto.trim()) {
      throw new Error(
        'Nenhum texto extraído. PDF de imagem escaneada e página que só renderiza por ' +
          'JavaScript não são lidos — nesses casos, cole o conteúdo como texto.',
      );
    }

    const fragmentos = fragmentar(texto);
    if (fragmentos.length === 0) {
      throw new Error('O conteúdo é curto demais para ser indexado.');
    }

    const embeddings = await gerarEmbeddings(fragmentos.map((f) => f.conteudo));

    // Reindexação substitui: apaga o que existia antes de gravar o novo.
    await admin.from('fragmentos').delete().eq('documento_id', documentoId);

    const linhas = fragmentos.map((fragmento, indice) => ({
      documento_id: documentoId,
      ordem: fragmento.ordem,
      conteudo: fragmento.conteudo,
      tokens: fragmento.tokens,
      embedding: paraVetorPg(embeddings[indice]),
    }));

    for (let i = 0; i < linhas.length; i += 100) {
      const { error } = await admin.from('fragmentos').insert(linhas.slice(i, i + 100));
      if (error) throw new Error(`Falha ao gravar fragmentos: ${error.message}`);
    }

    await admin
      .from('documentos')
      .update({
        status: 'indexado',
        conteudo_bruto: texto.slice(0, 200_000),
        total_fragmentos: fragmentos.length,
        indexado_em: new Date().toISOString(),
        erro_msg: null,
      })
      .eq('id', documentoId);

    return { documentoId, titulo: documento.titulo, fragmentos: fragmentos.length };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha desconhecida na indexação.';

    await admin
      .from('documentos')
      .update({ status: 'erro', erro_msg: mensagem })
      .eq('id', documentoId);

    return { documentoId, titulo: documento.titulo, fragmentos: 0, erro: mensagem };
  }
}

interface DocumentoParaIndexar {
  tipo: string;
  storage_path: string | null;
  fonte_url: string | null;
  conteudo_bruto: string | null;
  titulo: string;
}

async function obterTexto(documento: DocumentoParaIndexar): Promise<string> {
  if (documento.tipo === 'texto') {
    return documento.conteudo_bruto ?? '';
  }

  if (documento.tipo === 'link') {
    if (!documento.fonte_url) throw new Error('Documento do tipo link sem URL cadastrada.');
    const { texto } = await extrairDeUrl(documento.fonte_url);
    return texto;
  }

  if (!documento.storage_path) throw new Error('Arquivo sem caminho no storage.');

  const admin = criarClienteAdmin();
  const { data, error } = await admin.storage.from(BUCKET).download(documento.storage_path);

  if (error || !data) {
    throw new Error(`Não foi possível baixar o arquivo: ${error?.message ?? 'sem retorno'}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return extrairTexto(buffer, documento.storage_path);
}

/**
 * Processa a fila de pendentes. Chamado pelo painel logo após o upload e pelo
 * cron, que recolhe o que ficou para trás quando o navegador foi fechado no
 * meio do processo.
 */
export async function processarFila(limite = 5): Promise<ResultadoIndexacao[]> {
  const admin = criarClienteAdmin();

  // Também recolhe o que travou em "processando": se a função serverless bateu
  // no limite de tempo no meio da extração, o documento fica nesse estado para
  // sempre e nunca mais seria tentado.
  const limiteTravado = new Date(Date.now() - MINUTOS_ATE_CONSIDERAR_TRAVADO * 60_000).toISOString();

  const { data: pendentes } = await admin
    .from('documentos')
    .select('id')
    .or(`status.eq.pendente,and(status.eq.processando,atualizado_em.lt.${limiteTravado})`)
    .order('criado_em', { ascending: true })
    .limit(limite);

  if (!pendentes?.length) return [];

  const resultados: ResultadoIndexacao[] = [];
  for (const { id } of pendentes) {
    resultados.push(await indexarDocumento(id));
  }

  return resultados;
}
