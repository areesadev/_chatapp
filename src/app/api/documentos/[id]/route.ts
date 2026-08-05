import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { criarClienteAdmin, registrarAuditoria } from '@/lib/supabase/admin';

interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * Ajusta metadados. Mudar sigilo ou vigência não exige reindexar — os dois são
 * lidos no momento da busca, não gravados no fragmento.
 */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const corpo = (await request.json()) as Record<string, unknown>;
  const alteracoes: Record<string, unknown> = {};

  if (typeof corpo.titulo === 'string' && corpo.titulo.trim()) {
    alteracoes.titulo = corpo.titulo.trim();
  }
  if (typeof corpo.descricao === 'string') alteracoes.descricao = corpo.descricao.trim() || null;
  if (['publico', 'interno', 'confidencial'].includes(corpo.sigilo as string)) {
    alteracoes.sigilo = corpo.sigilo;
  }
  if (['vigente', 'rascunho', 'obsoleto'].includes(corpo.vigencia as string)) {
    alteracoes.vigencia = corpo.vigencia;
  }
  if (typeof corpo.dataReferencia === 'string' || corpo.dataReferencia === null) {
    alteracoes.data_referencia = corpo.dataReferencia || null;
  }
  if (Array.isArray(corpo.tags)) {
    alteracoes.tags = corpo.tags.filter((t): t is string => typeof t === 'string');
  }

  if (Object.keys(alteracoes).length === 0) {
    return NextResponse.json({ erro: 'Nada a alterar.' }, { status: 400 });
  }

  const { data, error } = await auth.contexto.supabase
    .from('documentos')
    .update(alteracoes)
    .eq('id', id)
    .select('id, titulo, sigilo, vigencia')
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ erro: 'Documento não encontrado.' }, { status: 404 });

  await registrarAuditoria({
    usuario_id: auth.contexto.user.id,
    acao: 'documento.editar',
    entidade: 'documentos',
    entidade_id: id,
    detalhes: alteracoes,
  });

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { supabase, user } = auth.contexto;

  const { data: documento } = await supabase
    .from('documentos')
    .select('titulo, storage_path')
    .eq('id', id)
    .maybeSingle();

  if (!documento) {
    return NextResponse.json({ erro: 'Documento não encontrado.' }, { status: 404 });
  }

  // O arquivo no Storage não some junto com a linha: precisa ser removido antes,
  // senão fica órfão consumindo cota para sempre.
  if (documento.storage_path) {
    await criarClienteAdmin().storage.from('documentos').remove([documento.storage_path]);
  }

  // Os fragmentos caem por cascata na FK.
  const { error } = await supabase.from('documentos').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await registrarAuditoria({
    usuario_id: user.id,
    acao: 'documento.apagar',
    entidade: 'documentos',
    entidade_id: id,
    detalhes: { titulo: documento.titulo },
  });

  return NextResponse.json({ ok: true });
}
