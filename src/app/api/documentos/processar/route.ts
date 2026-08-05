import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { indexarDocumento, processarFila } from '@/lib/conhecimento/indexar';

// Extração + embeddings de um arquivo grande passa de um minuto. No plano Pro
// da Vercel, suba para 300.
export const maxDuration = 60;

/**
 * Indexa um documento específico ou processa a fila de pendentes.
 *
 * Chamado pelo painel logo depois do cadastro; o cron em /api/cron/indexar
 * recolhe o que ficou para trás.
 */
export async function POST(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { documentoId } = (await request.json().catch(() => ({}))) as {
    documentoId?: string;
  };

  if (documentoId) {
    // Reindexação: devolve à fila antes de processar, para o painel refletir
    // o estado mesmo se a requisição cair no meio.
    await criarClienteAdmin()
      .from('documentos')
      .update({ status: 'pendente', erro_msg: null })
      .eq('id', documentoId);

    const resultado = await indexarDocumento(documentoId);
    return NextResponse.json(
      { resultados: [resultado] },
      { status: resultado.erro ? 422 : 200 },
    );
  }

  const resultados = await processarFila();
  return NextResponse.json({ resultados });
}
