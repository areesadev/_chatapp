import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com a chave secreta: ignora RLS.
 *
 * Use apenas em rotas de servidor e só para o que o usuário logado
 * legitimamente não consegue fazer sozinho — convidar colaborador, gravar
 * auditoria, sincronizar catálogo de modelos. Nunca importe isso em
 * componente de cliente.
 */
export function criarClienteAdmin() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) {
    throw new Error('SUPABASE_SECRET_KEY não configurada no ambiente.');
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Grava uma entrada de auditoria. Falha em silêncio: log não derruba request. */
export async function registrarAuditoria(entrada: {
  usuario_id: string | null;
  acao: string;
  entidade?: string;
  entidade_id?: string;
  detalhes?: Record<string, unknown>;
}) {
  try {
    await criarClienteAdmin().from('auditoria').insert({
      usuario_id: entrada.usuario_id,
      acao: entrada.acao,
      entidade: entrada.entidade ?? null,
      entidade_id: entrada.entidade_id ?? null,
      detalhes: entrada.detalhes ?? {},
    });
  } catch (erro) {
    console.error('Falha ao registrar auditoria:', erro);
  }
}
