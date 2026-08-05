import { PainelConfig } from '@/components/admin/painel-config';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { PERSONA_PADRAO } from '@/lib/ia';
import type { Modelo, Skill } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

export default async function PaginaConfig() {
  const supabase = await criarClienteServidor();

  const [{ data: skills }, { data: modelos }, { data: configs }] = await Promise.all([
    supabase.from('skills').select('*').order('ordem'),
    supabase.from('modelos').select('*').order('provedor').order('ordem'),
    supabase.from('configuracoes').select('chave, valor'),
  ]);

  const mapa = new Map((configs ?? []).map((c) => [c.chave, c.valor]));
  const persona = typeof mapa.get('persona_base') === 'string'
    ? (mapa.get('persona_base') as string)
    : PERSONA_PADRAO;

  return (
    <PainelConfig
      skills={(skills as Skill[]) ?? []}
      modelos={(modelos as Modelo[]) ?? []}
      persona={persona}
    />
  );
}
