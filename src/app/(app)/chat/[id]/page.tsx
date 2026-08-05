import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import type { MensagemVisivel } from '@/components/chat/mensagem';
import { carregarConversa, carregarOpcoes, exigirPerfil } from '@/lib/dados';

export default async function ConversaExistente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const perfil = await exigirPerfil();

  const [dados, { skills, modelos }] = await Promise.all([
    carregarConversa(id),
    carregarOpcoes(),
  ]);

  // O RLS já filtra o que este usuário pode ver; nada encontrado é 404.
  if (!dados) notFound();

  const { conversa, mensagens } = dados;

  const visiveis: MensagemVisivel[] = mensagens.map((m) => ({
    id: m.id,
    papel: m.papel,
    conteudo: m.conteudo,
    raciocinio: m.raciocinio,
    erro: m.erro,
    modelo: m.modelo_usado,
    citacoes: m.citacoes,
  }));

  // Um modelo pode ter sido desativado depois da conversa começar.
  const modeloAindaAtivo = modelos.some((m) => m.id === conversa.modelo_id);

  return (
    <Chat
      conversaIdInicial={conversa.id}
      mensagensIniciais={visiveis}
      skills={skills}
      modelos={modelos}
      skillIdInicial={conversa.skill_id}
      modeloIdInicial={modeloAindaAtivo ? conversa.modelo_id : (modelos[0]?.id ?? null)}
      compartilhadaInicial={conversa.compartilhada}
      nomeUsuario={perfil.nome ?? ''}
    />
  );
}
