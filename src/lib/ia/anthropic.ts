import Anthropic from '@anthropic-ai/sdk';
import type { EventoStream, ParametrosConversa } from './tipos';
import { suportaRaciocinioAdaptativo } from './tipos';

/**
 * Modelo para onde a Anthropic redireciona uma recusa dos classificadores de
 * segurança. Sem isso, um falso positivo derruba a resposta inteira em vez de
 * ser reexecutada em outro modelo dentro da mesma chamada.
 */
const MODELO_DE_RESERVA = 'claude-opus-4-8';

/**
 * Só os modelos de topo aceitam `fallbacks` — Sonnet e Haiku devolvem 400
 * ("does not support the `fallbacks` parameter") se o campo for enviado.
 */
function aceitaFallback(modelId: string): boolean {
  return /^claude-(opus-5|fable-5|mythos-5)/.test(modelId);
}

export async function* conversarAnthropic({
  modelo,
  instrucoes,
  mensagens,
  buscaWeb,
  sinal,
}: ParametrosConversa): AsyncGenerator<EventoStream, void, unknown> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    yield { tipo: 'erro', mensagem: 'ANTHROPIC_API_KEY não configurada no servidor.' };
    return;
  }

  const cliente = new Anthropic({ apiKey: chave });
  const adaptativo = suportaRaciocinioAdaptativo(modelo.model_id);

  const stream = cliente.beta.messages.stream(
    {
      model: modelo.model_id,
      max_tokens: modelo.max_saida,
      system: instrucoes,
      messages: mensagens.map((m) => ({ role: m.papel, content: m.conteudo })),
      // `display: summarized` deixa o raciocínio visível na interface. Sem
      // isso o usuário encara uma pausa longa antes do primeiro token.
      ...(adaptativo
        ? { thinking: { type: 'adaptive' as const, display: 'summarized' as const } }
        : {}),
      ...(aceitaFallback(modelo.model_id)
        ? {
            betas: ['server-side-fallback-2026-06-01'],
            fallbacks: [{ model: MODELO_DE_RESERVA }],
          }
        : {}),
      // Ferramenta server-side: a Anthropic executa a busca e devolve os
      // resultados no mesmo stream, sem loop de tool call do nosso lado.
      ...(buscaWeb
        ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const }] }
        : {}),
    },
    { signal: sinal },
  );

  try {
    for await (const evento of stream) {
      if (evento.type !== 'content_block_delta') continue;

      if (evento.delta.type === 'thinking_delta') {
        yield { tipo: 'raciocinio', texto: evento.delta.thinking };
      } else if (evento.delta.type === 'text_delta') {
        yield { tipo: 'texto', texto: evento.delta.text };
      }
    }

    const final = await stream.finalMessage();

    if (final.stop_reason === 'refusal') {
      yield {
        tipo: 'erro',
        mensagem:
          'O modelo recusou responder a esta solicitação por política de segurança. ' +
          'Reformule a pergunta ou troque de modelo.',
      };
      return;
    }

    if (final.stop_reason === 'max_tokens') {
      yield {
        tipo: 'texto',
        texto: '\n\n_[resposta interrompida por limite de tamanho — peça a continuação]_',
      };
    }

    yield {
      tipo: 'uso',
      tokensEntrada:
        final.usage.input_tokens +
        (final.usage.cache_read_input_tokens ?? 0) +
        (final.usage.cache_creation_input_tokens ?? 0),
      tokensSaida: final.usage.output_tokens,
    };
  } catch (erro) {
    if (sinal?.aborted) return;
    yield { tipo: 'erro', mensagem: traduzirErro(erro) };
  }
}

function traduzirErro(erro: unknown): string {
  if (erro instanceof Anthropic.RateLimitError) {
    return 'Limite de requisições da Anthropic atingido. Aguarde alguns instantes.';
  }
  if (erro instanceof Anthropic.AuthenticationError) {
    return 'Chave da Anthropic inválida ou expirada.';
  }
  if (erro instanceof Anthropic.NotFoundError) {
    return 'Modelo não encontrado na Anthropic. Verifique o cadastro em Configurações.';
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return 'Não foi possível conectar à Anthropic. Verifique a conexão.';
  }
  if (erro instanceof Anthropic.APIError) {
    return `Erro da Anthropic (${erro.status}): ${erro.message}`;
  }
  return erro instanceof Error ? erro.message : 'Erro desconhecido ao falar com a Anthropic.';
}
