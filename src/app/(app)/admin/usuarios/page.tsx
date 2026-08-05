import { PainelUsuarios } from '@/components/admin/painel-usuarios';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import type { Perfil } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

interface Convite {
  email: string;
  nome: string | null;
  papel: string;
  criado_em: string;
  usado_em: string | null;
}

interface Gasto {
  usuario_id: string;
  custo_usd: number;
}

export default async function PaginaUsuarios() {
  // Chave secreta: o RLS de `perfis` mostra ao master todos os perfis, mas o
  // consumo agregado depende de ler mensagens de conversas alheias, que são
  // privadas por política. O total por pessoa é agregado, nunca o conteúdo.
  const admin = criarClienteAdmin();

  const inicioDoMes = new Date();
  inicioDoMes.setUTCDate(1);
  inicioDoMes.setUTCHours(0, 0, 0, 0);

  const [{ data: perfis }, { data: convites }, { data: consumo }] = await Promise.all([
    admin.from('perfis').select('*').order('criado_em', { ascending: true }),
    admin
      .from('convites')
      .select('email, nome, papel, criado_em, usado_em')
      .is('usado_em', null)
      .order('criado_em', { ascending: false }),
    admin
      .from('consumo_mensal')
      .select('usuario_id, custo_usd')
      .gte('mes', inicioDoMes.toISOString()),
  ]);

  const gastos = new Map<string, number>(
    ((consumo as Gasto[]) ?? []).map((g) => [g.usuario_id, Number(g.custo_usd)]),
  );

  return (
    <PainelUsuarios
      perfis={(perfis as Perfil[]) ?? []}
      convitesPendentes={(convites as Convite[]) ?? []}
      gastos={Object.fromEntries(gastos)}
    />
  );
}
