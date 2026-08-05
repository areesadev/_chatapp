import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { registrarAuditoria } from '@/lib/supabase/admin';

interface Contexto {
  params: Promise<{ id: string }>;
}

/** Liga/desliga o modelo no seletor e define se ele pode ver material confidencial. */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const corpo = (await request.json()) as Record<string, unknown>;
  const alteracoes: Record<string, unknown> = {};

  if (typeof corpo.ativo === 'boolean') alteracoes.ativo = corpo.ativo;
  if (typeof corpo.permiteConfidencial === 'boolean') {
    alteracoes.permite_confidencial = corpo.permiteConfidencial;
  }
  if (Number.isFinite(corpo.ordem)) alteracoes.ordem = Number(corpo.ordem);

  if (Object.keys(alteracoes).length === 0) {
    return NextResponse.json({ erro: 'Nada a alterar.' }, { status: 400 });
  }

  const { supabase, user } = auth.contexto;

  // Liberar confidencial para um modelo gratuito manda documento sigiloso da
  // agência para um provedor que costuma treinar com o que recebe.
  if (alteracoes.permite_confidencial === true) {
    const { data: modelo } = await supabase
      .from('modelos')
      .select('gratuito, nome_exibicao')
      .eq('id', id)
      .maybeSingle();

    if (modelo?.gratuito && corpo.confirmarGratuito !== true) {
      return NextResponse.json(
        {
          erro:
            `"${modelo.nome_exibicao}" é gratuito. Provedores gratuitos podem usar o conteúdo ` +
            'enviado para treinamento — liberar documentos confidenciais para ele expõe ' +
            'material interno da agência.',
          exigeConfirmacao: true,
        },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabase
    .from('modelos')
    .update(alteracoes)
    .eq('id', id)
    .select('id, nome_exibicao, ativo, permite_confidencial')
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ erro: 'Modelo não encontrado.' }, { status: 404 });

  await registrarAuditoria({
    usuario_id: user.id,
    acao: 'modelo.editar',
    entidade: 'modelos',
    entidade_id: id,
    detalhes: { nome: data.nome_exibicao, ...alteracoes },
  });

  return NextResponse.json(data);
}
