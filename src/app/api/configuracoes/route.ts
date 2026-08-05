import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { registrarAuditoria } from '@/lib/supabase/admin';

const CHAVES_PERMITIDAS = [
  'persona_base',
  'contexto_agencia',
  'modelo_padrao_slug',
  'aviso_modelo_gratuito',
];

/** Atualiza uma configuração global. Só chaves conhecidas são aceitas. */
export async function PATCH(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { chave, valor } = (await request.json()) as { chave?: string; valor?: string };

  if (!chave || !CHAVES_PERMITIDAS.includes(chave)) {
    return NextResponse.json({ erro: 'Configuração desconhecida.' }, { status: 400 });
  }
  if (typeof valor !== 'string' || !valor.trim()) {
    return NextResponse.json({ erro: 'Valor vazio.' }, { status: 400 });
  }

  const { error } = await auth.contexto.supabase
    .from('configuracoes')
    .upsert({ chave, valor: valor.trim() }, { onConflict: 'chave' });

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await registrarAuditoria({
    usuario_id: auth.contexto.user.id,
    acao: 'configuracao.editar',
    entidade: 'configuracoes',
    entidade_id: chave,
    detalhes: { tamanho: valor.trim().length },
  });

  return NextResponse.json({ ok: true });
}
