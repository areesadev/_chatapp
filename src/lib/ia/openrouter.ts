import type { EventoStream, ParametrosConversa } from './tipos';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

interface PedacoSSE {
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number };
}

export async function* conversarOpenRouter({
  modelo,
  instrucoes,
  mensagens,
  buscaWeb,
  sinal,
}: ParametrosConversa): AsyncGenerator<EventoStream, void, unknown> {
  const chave = process.env.OPENROUTER_API_KEY;
  if (!chave) {
    yield { tipo: 'erro', mensagem: 'OPENROUTER_API_KEY não configurada no servidor.' };
    return;
  }

  let resposta: Response;
  try {
    resposta = await fetch(ENDPOINT, {
      method: 'POST',
      signal: sinal,
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
        // Identificam a aplicação nos rankings e no painel do OpenRouter.
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'Areesa _cerebro',
      },
      body: JSON.stringify({
        model: modelo.model_id,
        max_tokens: modelo.max_saida,
        stream: true,
        stream_options: { include_usage: true },
        usage: { include: true },
        // O plugin `web` do OpenRouter funciona em qualquer modelo do catálogo,
        // inclusive nos que não suportam tool calling. É cobrado à parte, mesmo
        // sobre modelo gratuito.
        ...(buscaWeb ? { plugins: [{ id: 'web' }] } : {}),
        messages: [
          { role: 'system', content: instrucoes },
          ...mensagens.map((m) => ({ role: m.papel, content: m.conteudo })),
        ],
      }),
    });
  } catch (erro) {
    if (sinal?.aborted) return;
    yield {
      tipo: 'erro',
      mensagem: erro instanceof Error ? erro.message : 'Falha ao conectar ao OpenRouter.',
    };
    return;
  }

  if (!resposta.ok || !resposta.body) {
    yield { tipo: 'erro', mensagem: await descreverFalha(resposta) };
    return;
  }

  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let recebeuAlgo = false;
  let recebeuRaciocinio = false;

  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;

      buffer += decodificador.decode(value, { stream: true });

      // O OpenRouter intercala comentários SSE (": OPENROUTER PROCESSING")
      // como keep-alive; linhas que não começam com "data: " são descartadas.
      const linhas = buffer.split('\n');
      buffer = linhas.pop() ?? '';

      for (const linha of linhas) {
        const conteudo = linha.trim();
        if (!conteudo.startsWith('data:')) continue;

        const carga = conteudo.slice(5).trim();
        if (carga === '[DONE]') continue;

        let pedaco: PedacoSSE;
        try {
          pedaco = JSON.parse(carga);
        } catch {
          continue;
        }

        if (pedaco.error) {
          yield {
            tipo: 'erro',
            mensagem: pedaco.error.message ?? 'O OpenRouter retornou um erro.',
          };
          return;
        }

        const delta = pedaco.choices?.[0]?.delta;
        if (delta?.reasoning) {
          recebeuRaciocinio = true;
          yield { tipo: 'raciocinio', texto: delta.reasoning };
        }
        if (delta?.content) {
          recebeuAlgo = true;
          yield { tipo: 'texto', texto: delta.content };
        }

        if (pedaco.usage) {
          tokensEntrada = pedaco.usage.prompt_tokens ?? 0;
          tokensSaida = pedaco.usage.completion_tokens ?? 0;
        }
      }
    }
  } catch (erro) {
    if (sinal?.aborted) return;
    yield {
      tipo: 'erro',
      mensagem: erro instanceof Error ? erro.message : 'Stream do OpenRouter interrompido.',
    };
    return;
  } finally {
    leitor.releaseLock();
  }

  if (!recebeuAlgo) {
    // O roteador gratuito sorteia o provedor a cada chamada e pode cair num
    // modelo de raciocínio que gasta todo o orçamento pensando, sem chegar a
    // escrever a resposta.
    yield {
      tipo: 'erro',
      mensagem: recebeuRaciocinio
        ? 'O modelo gastou todo o limite de tokens raciocinando e não chegou a responder. ' +
          'Tente de novo ou escolha um modelo pago para esta tarefa.'
        : 'O modelo não retornou conteúdo. Modelos gratuitos costumam ficar sobrecarregados — ' +
          'tente de novo ou escolha outro modelo.',
    };
    return;
  }

  yield { tipo: 'uso', tokensEntrada, tokensSaida };
}

async function descreverFalha(resposta: Response): Promise<string> {
  let detalhe = '';
  try {
    const corpo = await resposta.json();
    detalhe = corpo?.error?.message ?? '';
  } catch {
    // corpo não-JSON: segue só com o status
  }

  switch (resposta.status) {
    case 401:
      return 'Chave do OpenRouter inválida ou expirada.';
    case 402:
      return 'Créditos insuficientes no OpenRouter para usar este modelo pago.';
    case 429:
      return 'Limite de requisições do OpenRouter atingido (modelos gratuitos: ~20/min e 200/dia por conta). Aguarde ou escolha um modelo pago.';
    case 502:
    case 503:
      return 'O provedor deste modelo está indisponível no momento. Tente outro modelo.';
    default:
      return `Erro do OpenRouter (${resposta.status})${detalhe ? `: ${detalhe}` : ''}`;
  }
}
