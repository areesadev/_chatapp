import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { registrarAuditoria } from '@/lib/supabase/admin';
import type { NivelSigilo, PapelUsuario } from '@/lib/tipos';

interface Contexto {
  params: Promise<{ id: string }>;
}

const PAPEIS: PapelUsuario[] = ['master', 'socio', 'diretor', 'colaborador'];
const SIGILOS: NivelSigilo[] = ['publico', 'interno', 'confidencial'];

/**
 * Altera papel, sigilo, teto de gasto ou status de um usuário.
 *
 * Usa a sessão do master, e não a chave secreta: o trigger
 * `proteger_campos_de_perfil` só libera esses quatro campos quando
 * `eh_master()` é verdadeiro, e essa função depende de `auth.uid()`. Com a
 * chave secreta não há usuário na requisição, então o trigger reverteria a
 * alteração em silêncio — o update responderia 200 com os valores antigos.
 */
export async function PATCH(request: NextRequest, { params }: Contexto) {
  const { id } = await params;
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { supabase, user } = auth.contexto;
  const corpo = (await request.json()) as Record<string, unknown>;
  const alteracoes: Record<string, unknown> = {};

  if (PAPEIS.includes(corpo.papel as PapelUsuario)) alteracoes.papel = corpo.papel;
  if (SIGILOS.includes(corpo.sigiloMaximo as NivelSigilo)) {
    alteracoes.sigilo_maximo = corpo.sigiloMaximo;
  }
  if (Number.isFinite(corpo.limiteMensalUsd)) {
    alteracoes.limite_mensal_usd = Math.max(0, Number(corpo.limiteMensalUsd));
  }
  if (typeof corpo.ativo === 'boolean') alteracoes.ativo = corpo.ativo;
  if (typeof corpo.nome === 'string') alteracoes.nome = corpo.nome.trim() || null;

  if (Object.keys(alteracoes).length === 0) {
    return NextResponse.json({ erro: 'Nada a alterar.' }, { status: 400 });
  }

  // Trava contra ficar sem administrador: rebaixar ou desativar o último master
  // deixaria a base de conhecimento e as permissões sem ninguém que possa mexer.
  const rebaixando = alteracoes.papel !== undefined && alteracoes.papel !== 'master';
  const desativando = alteracoes.ativo === false;

  if (rebaixando || desativando) {
    const { data: alvo } = await supabase
      .from('perfis')
      .select('papel, ativo')
      .eq('id', id)
      .maybeSingle();

    if (alvo?.papel === 'master' && alvo.ativo) {
      const { count } = await supabase
        .from('perfis')
        .select('id', { count: 'exact', head: true })
        .eq('papel', 'master')
        .eq('ativo', true);

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { erro: 'Este é o único administrador ativo. Promova outra pessoa antes.' },
          { status: 409 },
        );
      }
    }
  }

  const { data, error } = await supabase
    .from('perfis')
    .update(alteracoes)
    .eq('id', id)
    .select('id, email, nome, papel, sigilo_maximo, limite_mensal_usd, ativo')
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ erro: 'Usuário não encontrado.' }, { status: 404 });

  // O trigger pode reverter campos protegidos sem levantar erro. Comparar o que
  // voltou com o que foi pedido evita que a interface mostre sucesso à toa.
  const naoAplicados = Object.entries(alteracoes).filter(
    ([campo, valor]) => (data as Record<string, unknown>)[campo] !== valor,
  );

  if (naoAplicados.length > 0) {
    return NextResponse.json(
      {
        erro: `O banco recusou a alteração de: ${naoAplicados.map(([c]) => c).join(', ')}.`,
      },
      { status: 409 },
    );
  }

  await registrarAuditoria({
    usuario_id: user.id,
    acao: 'usuario.editar',
    entidade: 'perfis',
    entidade_id: id,
    detalhes: { email: data.email, ...alteracoes },
  });

  return NextResponse.json(data);
}
