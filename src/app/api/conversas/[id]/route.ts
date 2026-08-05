import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';

interface Contexto {
  params: Promise<{ id: string }>;
}

/** Renomear, compartilhar ou arquivar. O RLS garante que só o dono altera. */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const corpo = (await request.json()) as {
    titulo?: string;
    compartilhada?: boolean;
    arquivada?: boolean;
  };

  const alteracoes: Record<string, unknown> = {};
  if (typeof corpo.titulo === 'string') {
    const titulo = corpo.titulo.trim().slice(0, 120);
    if (!titulo) return NextResponse.json({ erro: 'Título vazio.' }, { status: 400 });
    alteracoes.titulo = titulo;
  }
  if (typeof corpo.compartilhada === 'boolean') alteracoes.compartilhada = corpo.compartilhada;
  if (typeof corpo.arquivada === 'boolean') alteracoes.arquivada = corpo.arquivada;

  if (Object.keys(alteracoes).length === 0) {
    return NextResponse.json({ erro: 'Nada a alterar.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('conversas')
    .update(alteracoes)
    .eq('id', id)
    .select('id, titulo, compartilhada, arquivada')
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ erro: 'Conversa não encontrada.' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { error } = await supabase.from('conversas').delete().eq('id', id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
