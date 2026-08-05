import OpenAI from 'openai';

export const MODELO_EMBEDDING = 'text-embedding-3-small';
export const DIMENSOES = 1536;

/** Teto por requisição — a API aceita mais, mas lotes grandes chegam ao limite de tokens. */
const TAMANHO_LOTE = 96;

function cliente(): OpenAI {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) {
    throw new Error('OPENAI_API_KEY não configurada — a indexação precisa dela.');
  }
  return new OpenAI({ apiKey: chave });
}

/** Gera embeddings preservando a ordem da entrada. */
export async function gerarEmbeddings(textos: string[]): Promise<number[][]> {
  if (textos.length === 0) return [];

  const openai = cliente();
  const vetores: number[][] = [];

  for (let i = 0; i < textos.length; i += TAMANHO_LOTE) {
    const lote = textos.slice(i, i + TAMANHO_LOTE);

    try {
      const resposta = await openai.embeddings.create({
        model: MODELO_EMBEDDING,
        input: lote.map((t) => t.replace(/\n/g, ' ').slice(0, 8000)),
      });

      // A API não garante a ordem de retorno; o campo `index` é a referência.
      const ordenados = [...resposta.data].sort((a, b) => a.index - b.index);
      vetores.push(...ordenados.map((item) => item.embedding));
    } catch (erro) {
      throw new Error(traduzirErro(erro));
    }
  }

  return vetores;
}

function traduzirErro(erro: unknown): string {
  if (erro instanceof OpenAI.APIError) {
    if (erro.code === 'credit_balance_exhausted' || erro.type === 'insufficient_quota') {
      return (
        'A conta da OpenAI está sem créditos e a indexação depende dela para gerar os ' +
        'embeddings. Adicione crédito em platform.openai.com/settings/organization/billing ' +
        'e reindexe — indexar centenas de documentos custa poucos centavos.'
      );
    }
    if (erro.status === 401) return 'Chave da OpenAI inválida ou revogada.';
    if (erro.status === 429) return 'Limite de requisições da OpenAI atingido. Tente em alguns minutos.';
    return `Erro da OpenAI (${erro.status}): ${erro.message}`;
  }
  return erro instanceof Error ? erro.message : 'Falha desconhecida ao gerar embeddings.';
}

export async function gerarEmbedding(texto: string): Promise<number[]> {
  const [vetor] = await gerarEmbeddings([texto]);
  return vetor;
}

/** Formato aceito pelo pgvector via PostgREST. */
export function paraVetorPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
