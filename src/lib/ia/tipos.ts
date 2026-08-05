import type { Modelo } from '@/lib/tipos';

export interface MensagemIA {
  papel: 'user' | 'assistant';
  conteudo: string;
}

/** Eventos normalizados: Anthropic e OpenRouter emitem o mesmo formato. */
export type EventoStream =
  | { tipo: 'raciocinio'; texto: string }
  | { tipo: 'texto'; texto: string }
  /**
   * `custoUsd` só vem quando o provedor informa o valor real da chamada — é o
   * caso do OpenRouter. Sem ele, o custo é calculado pela tabela de preços.
   */
  | { tipo: 'uso'; tokensEntrada: number; tokensSaida: number; custoUsd?: number }
  | { tipo: 'modelo'; nome: string }
  | { tipo: 'erro'; mensagem: string };

export interface ParametrosConversa {
  modelo: Modelo;
  instrucoes: string;
  mensagens: MensagemIA[];
  buscaWeb?: boolean;
  sinal?: AbortSignal;
}

export type Conversador = (
  parametros: ParametrosConversa,
) => AsyncGenerator<EventoStream, void, unknown>;

/**
 * Modelos que aceitam `thinking: adaptive`. Haiku 4.5 e anteriores usam o
 * parâmetro antigo `budget_tokens` e recusam `effort` — para eles, o mais
 * simples é não mandar configuração de raciocínio nenhuma.
 */
export function suportaRaciocinioAdaptativo(modelId: string): boolean {
  return /^claude-(opus-(5|4-[6-9])|sonnet-(5|4-6)|fable-5|mythos-5)/.test(modelId);
}
