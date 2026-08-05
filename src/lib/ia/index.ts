import { conversarAnthropic } from './anthropic';
import { conversarOpenRouter } from './openrouter';
import type { EventoStream, ParametrosConversa } from './tipos';

export type { EventoStream, MensagemIA, ParametrosConversa } from './tipos';
export {
  calcularCusto,
  montarInstrucoes,
  PERSONA_PADRAO,
  tituloAPartirDe,
} from './prompt';

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
