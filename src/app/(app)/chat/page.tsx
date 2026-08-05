import { Chat } from '@/components/chat/chat';
import { carregarOpcoes, exigirPerfil } from '@/lib/dados';
import { criarClienteServidor } from '@/lib/supabase/servidor';

export default async function NovaConversa() {
  const perfil = await exigirPerfil();
  const { skills, modelos } = await carregarOpcoes();

  // Modelo padrão configurável, com o primeiro ativo como reserva.
  const supabase = await criarClienteServidor();
  const { data: config } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', 'modelo_padrao_slug')
    .maybeSingle();

  const slugPadrao = typeof config?.valor === 'string' ? config.valor : null;
  const padrao = modelos.find((m) => m.model_id === slugPadrao) ?? modelos[0] ?? null;

  return (
    <Chat
      conversaIdInicial={null}
      mensagensIniciais={[]}
      skills={skills}
      modelos={modelos}
      skillIdInicial={null}
      modeloIdInicial={padrao?.id ?? null}
      nomeUsuario={perfil.nome ?? ''}
    />
  );
}
