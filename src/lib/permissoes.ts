import type { SupabaseClient, User } from '@supabase/supabase-js';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import type { NivelSigilo, PapelUsuario } from '@/lib/tipos';

export interface Autorizacao {
  supabase: SupabaseClient;
  user: User;
  papel: PapelUsuario;
  sigiloMaximo: NivelSigilo;
}

export type ResultadoAutorizacao =
  | { ok: true; contexto: Autorizacao }
  | { ok: false; status: number; erro: string };

/** Sessão válida e perfil liberado. */
export async function exigirUsuario(): Promise<ResultadoAutorizacao> {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, erro: 'Não autenticado.' };

  const { data: perfil } = await supabase
    .from('perfis')
    .select('papel, ativo, sigilo_maximo')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.ativo) {
    return { ok: false, status: 403, erro: 'Acesso pendente de liberação.' };
  }

  return {
    ok: true,
    contexto: {
      supabase,
      user,
      papel: perfil.papel as PapelUsuario,
      sigiloMaximo: perfil.sigilo_maximo as NivelSigilo,
    },
  };
}

/** Idem, mas restrito ao master — base de conhecimento, usuários e configurações. */
export async function exigirMaster(): Promise<ResultadoAutorizacao> {
  const resultado = await exigirUsuario();
  if (!resultado.ok) return resultado;

  if (resultado.contexto.papel !== 'master') {
    return { ok: false, status: 403, erro: 'Ação restrita ao administrador.' };
  }

  return resultado;
}
