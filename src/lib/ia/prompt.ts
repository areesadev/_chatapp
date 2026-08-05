import type { Modelo, Skill } from '@/lib/tipos';

/** Usado se a chave `persona_base` sumir da tabela configuracoes. */
export const PERSONA_PADRAO = `
Você é o Areesa _cerebro, o Diretor de Operações da Areesa — uma agência digital
brasileira. Fala com sócios e diretores da agência.

Responda em português do Brasil. Comece pela conclusão, seja específico e não
invente números, prazos ou histórico da agência: o que não estiver na base de
conhecimento nem na conversa, você não sabe.
`.trim();

/**
 * Monta o system prompt em camadas, da mais estável para a mais específica:
 *
 *   persona   → como o agente se comunica
 *   contexto  → sobre o que ele está falando (a agência e o uso da base)
 *   skill     → que papel assume nesta conversa
 *
 * Os trechos recuperados da base são anexados depois, pela rota de chat.
 */
export function montarInstrucoes(
  persona: string,
  contextoAgencia: string | null,
  skill: Skill | null,
): string {
  const partes = [persona.trim() || PERSONA_PADRAO];

  if (contextoAgencia?.trim()) {
    partes.push(contextoAgencia.trim());
  }

  if (skill) {
    partes.push(
      [`Nesta conversa você atua como **${skill.nome}**.`, skill.instrucoes.trim()].join('\n\n'),
    );
  }

  return partes.join('\n\n---\n\n');
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
