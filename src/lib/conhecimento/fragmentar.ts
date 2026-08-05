/**
 * Quebra o texto em fragmentos para indexação.
 *
 * O corte respeita a estrutura do documento — primeiro parágrafos, depois
 * frases — porque um fragmento cortado no meio de uma frase perde o sentido
 * e piora tanto o embedding quanto o que o modelo lê depois.
 */

const TAMANHO_ALVO = 1500;
const SOBREPOSICAO = 200;
const TAMANHO_MINIMO = 80;

export interface Fragmento {
  ordem: number;
  conteudo: string;
  tokens: number;
}

export function fragmentar(texto: string): Fragmento[] {
  const limpo = texto.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpo) return [];

  const blocos = dividirEmBlocos(limpo);
  const fragmentos: string[] = [];
  let atual = '';

  for (const bloco of blocos) {
    if (atual && atual.length + bloco.length + 2 > TAMANHO_ALVO) {
      fragmentos.push(atual.trim());
      // Reinicia carregando o final do fragmento anterior: sem isso, uma
      // informação que atravessa a fronteira do corte fica irrecuperável.
      atual = cauda(atual, SOBREPOSICAO);
    }
    atual += (atual ? '\n\n' : '') + bloco;
  }

  if (atual.trim()) fragmentos.push(atual.trim());

  return fragmentos
    .filter((c) => c.length >= TAMANHO_MINIMO || fragmentos.length === 1)
    .map((conteudo, indice) => ({
      ordem: indice,
      conteudo,
      tokens: estimarTokens(conteudo),
    }));
}

/** Parágrafos; os que passarem do alvo são reduzidos a frases. */
function dividirEmBlocos(texto: string): string[] {
  const blocos: string[] = [];

  for (const paragrafo of texto.split(/\n\s*\n/)) {
    const limpo = paragrafo.trim();
    if (!limpo) continue;

    if (limpo.length <= TAMANHO_ALVO) {
      blocos.push(limpo);
      continue;
    }

    let acumulado = '';
    for (const frase of limpo.split(/(?<=[.!?])\s+/)) {
      if (acumulado && acumulado.length + frase.length + 1 > TAMANHO_ALVO) {
        blocos.push(acumulado.trim());
        acumulado = '';
      }
      // Frase única gigante (tabela larga, texto sem pontuação): corta no bruto.
      if (frase.length > TAMANHO_ALVO) {
        for (let i = 0; i < frase.length; i += TAMANHO_ALVO) {
          blocos.push(frase.slice(i, i + TAMANHO_ALVO));
        }
        continue;
      }
      acumulado += (acumulado ? ' ' : '') + frase;
    }

    if (acumulado.trim()) blocos.push(acumulado.trim());
  }

  return blocos;
}

function cauda(texto: string, tamanho: number): string {
  if (texto.length <= tamanho) return texto;
  const recorte = texto.slice(-tamanho);
  const quebra = recorte.search(/[.!?]\s|\n/);
  return quebra === -1 ? recorte : recorte.slice(quebra + 1).trim();
}

/** Estimativa suficiente para dimensionar lotes; não substitui contagem real. */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}
