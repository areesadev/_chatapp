import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { indexarDocumento, processarFila } from '@/lib/conhecimento/indexar';

// Extração + embeddings de um arquivo grande passa de um minuto. No plano Pro
// da Vercel, suba para 300.
export const maxDuration = 60;

/** Quantos documentos por chamada — o teto de 60s não comporta a base inteira. */
const LOTE = 3;

/**
 * Três modos:
 *
 * - `{ documentoId }` — reindexa um documento específico
 * - `{ todos: true }` — devolve a base inteira à fila e não processa nada
 * - `{}`              — processa um lote da fila e informa quanto restou
 *
 * A separação entre enfileirar e processar existe por causa do limite de
 * execução da Vercel: reindexar tudo de uma vez estouraria o tempo, então o
 * painel chama o processamento em sequência até a fila zerar.
 */
export async function POST(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const corpo = (await request.json().catch(() => ({}))) as {
    documentoId?: string;
    todos?: boolean;
  };

  const admin = criarClienteAdmin();

  if (corpo.todos) {
    const { data, error } = await admin
      .from('documentos')
      .update({ status: 'pendente', erro_msg: null })
      .neq('status', 'processando')
      .select('id');

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    return NextResponse.json({ enfileirados: data?.length ?? 0, resultados: [] });
  }

  if (corpo.documentoId) {
    // Devolve à fila antes de processar, para o painel refletir o estado mesmo
    // se a requisição cair no meio.
    await admin
      .from('documentos')
      .update({ status: 'pendente', erro_msg: null })
      .eq('id', corpo.documentoId);

    const resultado = await indexarDocumento(corpo.documentoId);
    return NextResponse.json(
      { resultados: [resultado], restantes: await contarPendentes() },
      { status: resultado.erro ? 422 : 200 },
    );
  }

  const resultados = await processarFila(LOTE);
  return NextResponse.json({ resultados, restantes: await contarPendentes() });
}

async function contarPendentes(): Promise<number> {
  const { count } = await criarClienteAdmin()
    .from('documentos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente');

  return count ?? 0;
}
