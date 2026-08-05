import type { Citacao } from '@/lib/tipos';
import { extrairDeUrl } from './extrair';

/** Teto por mensagem: colar vinte links não pode travar a resposta. */
const MAXIMO_LINKS = 3;
const TIMEOUT_MS = 8000;
const MAXIMO_CARACTERES = 12_000;

export interface LinksDaMensagem {
  contexto: string | null;
  citacoes: Citacao[];
}

/**
 * Lê os links colados na conversa e devolve o conteúdo pronto para o contexto.
 *
 * A leitura acontece no servidor, e não por tool call, pelo mesmo motivo do
 * RAG: a maior parte dos modelos gratuitos do OpenRouter não suporta
 * ferramentas, e assim link colado funciona em todo o catálogo.
 */
export async function lerLinksDaMensagem(texto: string): Promise<LinksDaMensagem> {
  const urls = extrairUrls(texto);
  if (urls.length === 0) return { contexto: null, citacoes: [] };

  const lidos = await Promise.all(urls.map(buscar));
  const comConteudo = lidos.filter((l) => l !== null);

  if (comConteudo.length === 0) return { contexto: null, citacoes: [] };

  const blocos = comConteudo.map(
    (l, i) => `[L${i + 1}] ${l.titulo ?? l.url}\n${l.url}\n\n${l.texto}`,
  );

  const contexto = [
    '# Links enviados nesta conversa',
    '',
    'Conteúdo lido das URLs que o usuário colou na mensagem. Não faz parte da base',
    'de conhecimento da agência — trate como material trazido para esta conversa,',
    'e não como documentação oficial da Areesa.',
    '',
    'Cite com [L1], [L2] quando usar. Se uma página veio vazia ou irrelevante,',
    'diga isso em vez de supor o que ela conteria.',
    '',
    blocos.join('\n\n---\n\n'),
  ].join('\n');

  return {
    contexto,
    citacoes: comConteudo.map((l) => ({
      documento_id: '',
      titulo: l.titulo ?? l.url,
      trecho: l.texto.slice(0, 320),
      url: l.url,
    })),
  };
}

interface LinkLido {
  url: string;
  titulo: string | null;
  texto: string;
}

async function buscar(url: string): Promise<LinkLido | null> {
  try {
    const { titulo, texto } = await extrairDeUrl(url, AbortSignal.timeout(TIMEOUT_MS));
    const limpo = texto.trim();

    // Página que só renderiza por JavaScript volta praticamente vazia; injetar
    // isso só gastaria contexto e induziria o modelo a inventar o resto.
    if (limpo.length < 200) return null;

    return { url, titulo, texto: limpo.slice(0, MAXIMO_CARACTERES) };
  } catch (erro) {
    console.error(`Falha ao ler ${url}:`, erro instanceof Error ? erro.message : erro);
    return null;
  }
}

/** URLs http(s) da mensagem, sem repetição e sem endereços de rede interna. */
export function extrairUrls(texto: string): string[] {
  const encontradas = texto.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [];
  const unicas = new Set<string>();

  for (const bruta of encontradas) {
    // Pontuação final costuma grudar na URL quando ela fecha a frase.
    const url = bruta.replace(/[.,;:!?]+$/, '');
    if (ehPublica(url)) unicas.add(url);
    if (unicas.size >= MAXIMO_LINKS) break;
  }

  return [...unicas];
}

/**
 * Bloqueia endereços de rede interna.
 *
 * Sem isso, qualquer pessoa com acesso ao chat poderia usar o servidor como
 * ponte para varrer a rede onde a aplicação roda — é o clássico SSRF.
 */
function ehPublica(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '[::1]' ||
    host === '0.0.0.0'
  ) {
    return false;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // metadados de nuvem
  }

  return true;
}
