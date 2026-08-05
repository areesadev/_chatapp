import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import type { Conversa, Mensagem, Modelo, Perfil, Skill } from '@/lib/tipos';

/**
 * Perfil do usuário logado, já validado.
 * O middleware garante que existe sessão; aqui garantimos que ela foi liberada.
 */
export async function exigirPerfil(): Promise<Perfil> {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<Perfil>();

  if (!perfil?.ativo) redirect('/acesso-pendente');

  return perfil;
}

export async function listarConversas(): Promise<Conversa[]> {
  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from('conversas')
    .select('*')
    .eq('arquivada', false)
    .order('atualizado_em', { ascending: false })
    .limit(100);

  return (data as Conversa[]) ?? [];
}

/** Skills e modelos disponíveis para montar os seletores da conversa. */
export async function carregarOpcoes(): Promise<{ skills: Skill[]; modelos: Modelo[] }> {
  const supabase = await criarClienteServidor();

  const [{ data: skills }, { data: modelos }] = await Promise.all([
    supabase.from('skills').select('*').eq('ativa', true).order('ordem'),
    supabase.from('modelos').select('*').eq('ativo', true).order('ordem'),
  ]);

  return {
    skills: (skills as Skill[]) ?? [],
    modelos: (modelos as Modelo[]) ?? [],
  };
}

export async function carregarConversa(
  id: string,
): Promise<{ conversa: Conversa; mensagens: Mensagem[] } | null> {
  const supabase = await criarClienteServidor();

  const { data: conversa } = await supabase
    .from('conversas')
    .select('*')
    .eq('id', id)
    .maybeSingle<Conversa>();

  if (!conversa) return null;

  const { data: mensagens } = await supabase
    .from('mensagens')
    .select('*')
    .eq('conversa_id', id)
    .order('criado_em', { ascending: true });

  return { conversa, mensagens: (mensagens as Mensagem[]) ?? [] };
}

/** Gasto do usuário no mês corrente, em USD. */
export async function consumoDoMes(usuarioId: string): Promise<number> {
  const supabase = await criarClienteServidor();

  const inicio = new Date();
  inicio.setUTCDate(1);
  inicio.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('consumo_mensal')
    .select('custo_usd')
    .eq('usuario_id', usuarioId)
    .gte('mes', inicio.toISOString())
    .maybeSingle();

  return Number(data?.custo_usd ?? 0);
}
