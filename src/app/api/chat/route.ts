import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import {
  calcularCusto,
  conversar,
  montarInstrucoes,
  PERSONA_PADRAO,
  tituloAPartirDe,
  type MensagemIA,
} from '@/lib/ia';
import { recuperarConhecimento } from '@/lib/conhecimento/buscar';
import { lerLinksDaMensagem } from '@/lib/conhecimento/links-mensagem';
import type { Modelo, NivelSigilo, Skill } from '@/lib/tipos';

// O plano Hobby da Vercel limita a 60s. No Pro, suba para 300 — respostas
// longas do Opus 5 podem passar de um minuto.
export const maxDuration = 60;

/** Quantas mensagens anteriores acompanham o pedido. */
const JANELA_HISTORICO = 30;

interface CorpoRequisicao {
  mensagem?: string;
  conversaId?: string | null;
  skillId?: string | null;
  modeloId?: string | null;
  buscaWeb?: boolean;
  /**
   * Id de uma mensagem do usuário. Ela e tudo que veio depois são apagados
   * antes de gravar a nova — é o que sustenta tanto editar quanto refazer.
   */
  substituirAPartirDe?: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from('perfis')
    .select('id, ativo, limite_mensal_usd, sigilo_maximo')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.ativo) {
    return NextResponse.json({ erro: 'Acesso pendente de liberação.' }, { status: 403 });
  }

  const corpo = (await request.json()) as CorpoRequisicao;
  const textoUsuario = (corpo.mensagem ?? '').trim();

  if (!textoUsuario) {
    return NextResponse.json({ erro: 'Mensagem vazia.' }, { status: 400 });
  }

  // ─── Teto de gasto mensal ────────────────────────────────────────────────────
  if (Number(perfil.limite_mensal_usd) > 0) {
    const inicioDoMes = new Date();
    inicioDoMes.setUTCDate(1);
    inicioDoMes.setUTCHours(0, 0, 0, 0);

    const { data: consumo } = await supabase
      .from('consumo_mensal')
      .select('custo_usd')
      .eq('usuario_id', user.id)
      .gte('mes', inicioDoMes.toISOString())
      .maybeSingle();

    if (Number(consumo?.custo_usd ?? 0) >= Number(perfil.limite_mensal_usd)) {
      return NextResponse.json(
        {
          erro:
            `Você atingiu seu limite mensal de US$ ${Number(perfil.limite_mensal_usd).toFixed(2)}. ` +
            'Fale com o administrador para ampliar o teto.',
        },
        { status: 402 },
      );
    }
  }

  // ─── Modelo, skill e persona ─────────────────────────────────────────────────
  const { data: modelo } = await supabase
    .from('modelos')
    .select('*')
    .eq('id', corpo.modeloId ?? '')
    .eq('ativo', true)
    .maybeSingle<Modelo>();

  if (!modelo) {
    return NextResponse.json(
      { erro: 'Modelo não encontrado ou desativado.' },
      { status: 400 },
    );
  }

  let skill: Skill | null = null;
  if (corpo.skillId) {
    const { data } = await supabase
      .from('skills')
      .select('*')
      .eq('id', corpo.skillId)
      .eq('ativa', true)
      .maybeSingle<Skill>();
    skill = data ?? null;
  }

  const { data: configs } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['persona_base', 'contexto_agencia']);

  const porChave = new Map((configs ?? []).map((c) => [c.chave, c.valor]));
  const persona =
    typeof porChave.get('persona_base') === 'string'
      ? (porChave.get('persona_base') as string)
      : PERSONA_PADRAO;
  const contextoAgencia =
    typeof porChave.get('contexto_agencia') === 'string'
      ? (porChave.get('contexto_agencia') as string)
      : null;

  // ─── Conversa ────────────────────────────────────────────────────────────────
  let conversaId = corpo.conversaId ?? null;
  let conversaNova = false;

  if (conversaId) {
    const { data: existente } = await supabase
      .from('conversas')
      .select('id')
      .eq('id', conversaId)
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (!existente) conversaId = null;
  }

  if (!conversaId) {
    const { data: criada, error } = await supabase
      .from('conversas')
      .insert({
        usuario_id: user.id,
        titulo: tituloAPartirDe(textoUsuario),
        skill_id: skill?.id ?? null,
        modelo_id: modelo.id,
      })
      .select('id')
      .single();

    if (error || !criada) {
      return NextResponse.json({ erro: 'Não foi possível criar a conversa.' }, { status: 500 });
    }

    conversaId = criada.id;
    conversaNova = true;
  } else {
    // Skill e modelo podem mudar no meio da conversa; a conversa guarda o último.
    await supabase
      .from('conversas')
      .update({ skill_id: skill?.id ?? null, modelo_id: modelo.id })
      .eq('id', conversaId);
  }

  // Editar ou refazer: descarta o trecho a ser reescrito antes de gravar de novo.
  if (corpo.substituirAPartirDe) {
    const { data: alvo } = await supabase
      .from('mensagens')
      .select('criado_em')
      .eq('id', corpo.substituirAPartirDe)
      .eq('conversa_id', conversaId)
      .maybeSingle();

    if (alvo) {
      await supabase
        .from('mensagens')
        .delete()
        .eq('conversa_id', conversaId)
        .gte('criado_em', alvo.criado_em);
    }
  }

  const { data: mensagemUsuario } = await supabase
    .from('mensagens')
    .insert({
      conversa_id: conversaId,
      papel: 'user',
      conteudo: textoUsuario,
    })
    .select('id')
    .maybeSingle();

  // Descendente + reverse: precisamos das ÚLTIMAS mensagens da conversa.
  // Ordenar ascendente com limit traria as mais antigas e ignoraria o contexto
  // recente assim que a conversa passasse da janela.
  const { data: historico } = await supabase
    .from('mensagens')
    .select('papel, conteudo')
    .eq('conversa_id', conversaId)
    .is('erro', null)
    .order('criado_em', { ascending: false })
    .limit(JANELA_HISTORICO);

  const mensagens: MensagemIA[] = (historico ?? [])
    .reverse()
    .filter((m) => m.conteudo.trim().length > 0)
    .map((m) => ({ papel: m.papel as 'user' | 'assistant', conteudo: m.conteudo }));

  // A janela pode cortar no meio de um par: a conversa precisa abrir com o
  // usuário, senão a Anthropic recusa o request.
  while (mensagens.length > 0 && mensagens[0].papel !== 'user') {
    mensagens.shift();
  }

  // ─── Contexto da mensagem ────────────────────────────────────────────────────
  // Base de conhecimento e links colados são buscados em paralelo: um depende
  // do banco, o outro da rede, e serializar somaria as duas esperas.
  const [recuperacao, links] = await Promise.all([
    // O RLS limita ao sigilo do usuário e o parâmetro do modelo impede que
    // trecho confidencial vá para modelo gratuito.
    recuperarConhecimento(
      supabase,
      textoUsuario,
      (perfil.sigilo_maximo as NivelSigilo) ?? 'publico',
      modelo.permite_confidencial,
    ),
    lerLinksDaMensagem(textoUsuario),
  ]);

  const citacoes = [...recuperacao.citacoes, ...links.citacoes];

  const instrucoes = [
    montarInstrucoes(persona, contextoAgencia, skill),
    recuperacao.contexto,
    links.contexto,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  // ─── Streaming ───────────────────────────────────────────────────────────────
  const codificador = new TextEncoder();
  const idConversa = conversaId;

  const stream = new ReadableStream({
    async start(controlador) {
      const enviar = (evento: unknown) =>
        controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`));

      enviar({
        tipo: 'conversa',
        id: idConversa,
        nova: conversaNova,
        // O cliente precisa do id real para permitir editar esta mensagem depois.
        mensagemUsuarioId: mensagemUsuario?.id ?? null,
      });

      // Modelo escolhido. Se um roteador do OpenRouter atender com outro, ele
      // emite um evento `modelo` depois e a interface se corrige sozinha.
      enviar({ tipo: 'modelo', nome: modelo.model_id });

      if (citacoes.length > 0) {
        enviar({ tipo: 'citacoes', citacoes });
      }

      let texto = '';
      let raciocinio = '';
      let tokensEntrada = 0;
      let tokensSaida = 0;
      let custoInformado: number | undefined;
      // Com roteador do OpenRouter, quem responde só se sabe pela resposta.
      let modeloEfetivo = `${modelo.provedor}/${modelo.model_id}`;
      let mensagemErro: string | null = null;

      try {
        for await (const evento of conversar({
          modelo,
          instrucoes,
          mensagens,
          buscaWeb: corpo.buscaWeb === true,
          sinal: request.signal,
        })) {
          switch (evento.tipo) {
            case 'texto':
              texto += evento.texto;
              enviar(evento);
              break;
            case 'raciocinio':
              raciocinio += evento.texto;
              enviar(evento);
              break;
            case 'uso':
              tokensEntrada = evento.tokensEntrada;
              tokensSaida = evento.tokensSaida;
              custoInformado = evento.custoUsd;
              break;
            case 'modelo':
              modeloEfetivo = `${modelo.provedor}/${evento.nome}`;
              enviar(evento);
              break;
            case 'erro':
              mensagemErro = evento.mensagem;
              enviar(evento);
              break;
          }
        }
      } catch (erro) {
        mensagemErro = erro instanceof Error ? erro.message : 'Falha inesperada no streaming.';
        enviar({ tipo: 'erro', mensagem: mensagemErro });
      }

      // Grava mesmo quando houve erro ou o usuário abortou: o que já foi gerado
      // foi cobrado, e a conversa precisa refletir o que aconteceu.
      if (texto || mensagemErro) {
        // O valor informado pelo provedor tem precedência: com roteador, o
        // preço depende do modelo sorteado e a tabela local não sabe qual foi.
        const custo =
          custoInformado ?? calcularCusto(modelo, tokensEntrada, tokensSaida);

        // O id volta ao cliente no evento `fim` para que a exportação funcione
        // sem recarregar a página — o id local não existe no banco.
        const { data: gravada } = await supabase
          .from('mensagens')
          .insert({
            conversa_id: idConversa,
            papel: 'assistant',
            conteudo: texto,
            raciocinio: raciocinio || null,
            citacoes,
            modelo_usado: modeloEfetivo,
            tokens_entrada: tokensEntrada,
            tokens_saida: tokensSaida,
            custo_usd: custo,
            erro: mensagemErro,
          })
          .select('id')
          .maybeSingle();

        await supabase
          .from('conversas')
          .update({ atualizado_em: new Date().toISOString() })
          .eq('id', idConversa);

        enviar({
          tipo: 'fim',
          mensagemId: gravada?.id ?? null,
          tokensEntrada,
          tokensSaida,
          custo,
        });
      }

      controlador.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
