import { PainelBase } from '@/components/admin/painel-base';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import type { Documento } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

export default async function PaginaBase() {
  const supabase = await criarClienteServidor();

  const { data: documentos } = await supabase
    .from('documentos')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(200);

  const lista = (documentos as Documento[]) ?? [];

  const totalFragmentos = lista.reduce((soma, d) => soma + d.total_fragmentos, 0);
  const pendentes = lista.filter((d) => d.status === 'pendente' || d.status === 'processando').length;
  const comErro = lista.filter((d) => d.status === 'erro').length;

  return (
    <PainelBase
      documentos={lista}
      resumo={{ total: lista.length, totalFragmentos, pendentes, comErro }}
    />
  );
}
