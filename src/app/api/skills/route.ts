import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { registrarAuditoria } from '@/lib/supabase/admin';

/** Cria uma skill nova. O slug é derivado do nome e serve de chave estável. */
export async function POST(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const corpo = (await request.json()) as {
    nome?: string;
    descricao?: string;
    instrucoes?: string;
  };

  const nome = corpo.nome?.trim();
  const descricao = corpo.descricao?.trim();
  const instrucoes = corpo.instrucoes?.trim();

  if (!nome || !descricao || !instrucoes) {
    return NextResponse.json(
      { erro: 'Nome, descrição e instruções são obrigatórios.' },
      { status: 400 },
    );
  }

  const { supabase, user } = auth.contexto;

  const { data: ultima } = await supabase
    .from('skills')
    .select('ordem')
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('skills')
    .insert({
      slug: gerarSlug(nome),
      nome,
      descricao,
      instrucoes,
      ordem: (ultima?.ordem ?? 0) + 1,
      criado_por: user.id,
    })
    .select('id, slug, nome')
    .single();

  if (error) {
    const duplicado = error.code === '23505';
    return NextResponse.json(
      { erro: duplicado ? 'Já existe uma skill com esse nome.' : error.message },
      { status: 400 },
    );
  }

  await registrarAuditoria({
    usuario_id: user.id,
    acao: 'skill.criar',
    entidade: 'skills',
    entidade_id: data.id,
    detalhes: { nome },
  });

  return NextResponse.json(data, { status: 201 });
}

function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
