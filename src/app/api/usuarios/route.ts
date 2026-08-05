import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { criarClienteAdmin, registrarAuditoria } from '@/lib/supabase/admin';
import type { NivelSigilo, PapelUsuario } from '@/lib/tipos';

const PAPEIS: PapelUsuario[] = ['master', 'socio', 'diretor', 'colaborador'];
const SIGILOS: NivelSigilo[] = ['publico', 'interno', 'confidencial'];

interface CorpoConvite {
  email?: string;
  nome?: string;
  papel?: PapelUsuario;
  sigiloMaximo?: NivelSigilo;
  limiteMensalUsd?: number;
}

/**
 * Convida um colaborador.
 *
 * O convite fica registrado por e-mail; quando a pessoa entra pela primeira
 * vez, o trigger do banco lê o convite e já cria o perfil ativo com o papel
 * certo. Sem convite, o perfil nasce inativo.
 */
export async function POST(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const corpo = (await request.json()) as CorpoConvite;
  const email = corpo.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 });
  }

  const papel = PAPEIS.includes(corpo.papel as PapelUsuario)
    ? (corpo.papel as PapelUsuario)
    : 'colaborador';
  const sigilo = SIGILOS.includes(corpo.sigiloMaximo as NivelSigilo)
    ? (corpo.sigiloMaximo as NivelSigilo)
    : 'interno';
  const limite = Number.isFinite(corpo.limiteMensalUsd)
    ? Math.max(0, Number(corpo.limiteMensalUsd))
    : 25;

  const admin = criarClienteAdmin();

  // Quem já tem perfil não precisa de convite: basta ajustar o que existe.
  const { data: jaExiste } = await admin
    .from('perfis')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (jaExiste) {
    return NextResponse.json(
      { erro: 'Esse e-mail já tem perfil. Edite as permissões na lista abaixo.' },
      { status: 409 },
    );
  }

  const { error } = await admin.from('convites').upsert(
    {
      email,
      nome: corpo.nome?.trim() || null,
      papel,
      sigilo_maximo: sigilo,
      limite_mensal_usd: limite,
      criado_por: auth.contexto.user.id,
      usado_em: null,
    },
    { onConflict: 'email' },
  );

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await registrarAuditoria({
    usuario_id: auth.contexto.user.id,
    acao: 'usuario.convidar',
    entidade: 'convites',
    entidade_id: email,
    detalhes: { papel, sigilo, limite },
  });

  return NextResponse.json({ ok: true, email }, { status: 201 });
}
