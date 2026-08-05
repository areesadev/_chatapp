import { NextResponse, type NextRequest } from 'next/server';
import { processarFila } from '@/lib/conhecimento/indexar';

export const maxDuration = 60;

/**
 * Rede de segurança da indexação: pega documentos que ficaram pendentes porque
 * o navegador foi fechado antes de o painel chamar o processamento.
 *
 * Protegido por CRON_SECRET — a Vercel envia o cabeçalho automaticamente nos
 * cron jobs. Sem a variável definida, a rota fica desligada em vez de aberta.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;

  if (!segredo) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado.' }, { status: 503 });
  }

  if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const resultados = await processarFila(10);
  return NextResponse.json({ processados: resultados.length, resultados });
}
