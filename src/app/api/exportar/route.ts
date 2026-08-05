import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario } from '@/lib/permissoes';
import {
  gerarDocx,
  gerarPdf,
  gerarXlsx,
  nomeDeArquivo,
  TIPOS_MIME,
  type FormatoExportacao,
} from '@/lib/exportar';

export const maxDuration = 60;

const FORMATOS: FormatoExportacao[] = ['docx', 'xlsx', 'pdf'];

/**
 * Converte uma resposta já gerada em arquivo.
 *
 * Aciona por botão, não por detecção de intenção no texto — e reaproveita o
 * conteúdo que o usuário viu, em vez de pedir ao modelo para reescrever.
 */
export async function POST(request: NextRequest) {
  const auth = await exigirUsuario();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { mensagemId, formato } = (await request.json()) as {
    mensagemId?: string;
    formato?: FormatoExportacao;
  };

  if (!mensagemId || !formato || !FORMATOS.includes(formato)) {
    return NextResponse.json({ erro: 'Mensagem ou formato inválido.' }, { status: 400 });
  }

  // O RLS garante que só volta mensagem de conversa que o usuário pode ler.
  const { data: mensagem } = await auth.contexto.supabase
    .from('mensagens')
    .select('conteudo, conversa_id, conversas(titulo)')
    .eq('id', mensagemId)
    .maybeSingle<{
      conteudo: string;
      conversa_id: string;
      conversas: { titulo: string } | null;
    }>();

  if (!mensagem?.conteudo?.trim()) {
    return NextResponse.json(
      { erro: 'Mensagem não encontrada ou sem conteúdo para exportar.' },
      { status: 404 },
    );
  }

  const titulo = mensagem.conversas?.titulo ?? 'Areesa _cerebro';

  try {
    const arquivo =
      formato === 'docx'
        ? await gerarDocx(mensagem.conteudo, titulo)
        : formato === 'xlsx'
          ? await gerarXlsx(mensagem.conteudo, titulo)
          : await gerarPdf(mensagem.conteudo, titulo);

    return new Response(new Uint8Array(arquivo), {
      headers: {
        'Content-Type': TIPOS_MIME[formato],
        'Content-Disposition': `attachment; filename="${nomeDeArquivo(titulo, formato)}"`,
        'Content-Length': String(arquivo.length),
      },
    });
  } catch (erro) {
    console.error('Falha ao gerar arquivo:', erro);
    return NextResponse.json(
      { erro: 'Não foi possível gerar o arquivo a partir desta resposta.' },
      { status: 500 },
    );
  }
}
