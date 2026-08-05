import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { registrarAuditoria } from '@/lib/supabase/admin';

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const corpo = (await request.json()) as Record<string, unknown>;
  const alteracoes: Record<string, unknown> = {};

  for (const campo of ['nome', 'descricao', 'instrucoes'] as const) {
    if (typeof corpo[campo] === 'string' && (corpo[campo] as string).trim()) {
      alteracoes[campo] = (corpo[campo] as string).trim();
    }
  }
  if (typeof corpo.ativa === 'boolean') alteracoes.ativa = corpo.ativa;
  if (Number.isFinite(corpo.ordem)) alteracoes.ordem = Number(corpo.ordem);

  if (Object.keys(alteracoes).length === 0) {
    return NextResponse.json({ erro: 'Nada a alterar.' }, { status: 400 });
  }

  const { data, error } = await auth.contexto.supabase
    .from('skills')
    .update(alteracoes)
    .eq('id', id)
    .select('id, nome, ativa')
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ erro: 'Skill não encontrada.' }, { status: 404 });

  await registrarAuditoria({
    usuario_id: auth.contexto.user.id,
    acao: 'skill.editar',
    entidade: 'skills',
    entidade_id: id,
    detalhes: alteracoes,
  });

  return NextResponse.json(data);
}

/**
 * Remove a skill. As conversas que a usavam continuam válidas: a FK está com
 * `on delete set null`, então elas apenas ficam sem papel definido.
 */
export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { error } = await auth.contexto.supabase.from('skills').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await registrarAuditoria({
    usuario_id: auth.contexto.user.id,
    acao: 'skill.apagar',
    entidade: 'skills',
    entidade_id: id,
  });

  return NextResponse.json({ ok: true });
}
