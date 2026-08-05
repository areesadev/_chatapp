import type { Modelo, Skill } from '@/lib/tipos';
import { conversarAnthropic } from './anthropic';
import { conversarOpenRouter } from './openrouter';
import type { EventoStream, ParametrosConversa } from './tipos';

export type { EventoStream, MensagemIA, ParametrosConversa } from './tipos';

/** Usado se a chave `persona_base` sumir da tabela configuracoes. */
export const PERSONA_PADRAO = `
Você é o Areesa _cerebro, o Diretor de Operações da Areesa — uma agência digital
brasileira. Fala com sócios e diretores da agência.

Responda em português do Brasil. Comece pela conclusão, seja específico e não
invente números, prazos ou histórico da agência: o que não estiver na base de
conhecimento nem na conversa, você não sabe.
`.trim();

/** Despacha para o provedor certo. */
export function conversar(
  parametros: ParametrosConversa,
): AsyncGenerator<EventoStream, void, unknown> {
  switch (parametros.modelo.provedor) {
    case 'anthropic':
      return conversarAnthropic(parametros);
    case 'openrouter':
      return conversarOpenRouter(parametros);
  }
}

/**
 * Monta o system prompt: persona da agência + papel escolhido na conversa.
 * A skill especializa o comportamento; ela não substitui a persona.
 */
export function montarInstrucoes(persona: string, skill: Skill | null): string {
  const base = persona.trim() || PERSONA_PADRAO;
  if (!skill) return base;

  return [
    base,
    '---',
    `Nesta conversa você atua como **${skill.nome}**.`,
    skill.instrucoes.trim(),
  ].join('\n\n');
}

/** Custo em USD. Os valores cadastrados são por 1 milhão de tokens. */
export function calcularCusto(
  modelo: Pick<Modelo, 'custo_entrada_usd' | 'custo_saida_usd'>,
  tokensEntrada: number,
  tokensSaida: number,
): number {
  const custo =
    (tokensEntrada / 1_000_000) * Number(modelo.custo_entrada_usd) +
    (tokensSaida / 1_000_000) * Number(modelo.custo_saida_usd);

  return Number(custo.toFixed(6));
}

/** Título curto a partir da primeira mensagem, para a lista lateral. */
export function tituloAPartirDe(texto: string): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (!limpo) return 'Nova conversa';
  return limpo.length <= 48 ? limpo : `${limpo.slice(0, 48).trimEnd()}…`;
}
