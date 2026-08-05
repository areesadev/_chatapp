import type { SupabaseClient } from '@supabase/supabase-js';
import type { Citacao, NivelSigilo } from '@/lib/tipos';
import { gerarEmbedding, paraVetorPg } from './embeddings';

const LIMITE_FRAGMENTOS = 8;

interface FragmentoEncontrado {
  documento_id: string;
  titulo: string;
  fragmento_id: number;
  conteudo: string;
  sigilo: NivelSigilo;
  vigencia: 'vigente' | 'rascunho' | 'obsoleto';
  data_referencia: string | null;
  fonte_url: string | null;
  pontuacao: number;
}

export interface Recuperacao {
  contexto: string | null;
  citacoes: Citacao[];
  /** true quando o modelo escolhido não pode receber material confidencial. */
  filtrouConfidencial: boolean;
}

const PESO: Record<NivelSigilo, number> = { publico: 0, interno: 1, confidencial: 2 };

/**
 * Teto de sigilo efetivo da consulta: o menor entre o que a pessoa pode ver e o
 * que o modelo pode receber. Um sócio com acesso confidencial conversando em um
 * modelo gratuito continua sem enviar contrato para fora.
 */
export function sigiloEfetivo(
  sigiloUsuario: NivelSigilo,
  modeloPermiteConfidencial: boolean,
): NivelSigilo {
  const tetoModelo: NivelSigilo = modeloPermiteConfidencial ? 'confidencial' : 'interno';
  return PESO[sigiloUsuario] <= PESO[tetoModelo] ? sigiloUsuario : tetoModelo;
}

/**
 * Recupera trechos relevantes e monta o bloco de contexto do system prompt.
 *
 * A busca acontece antes da chamada ao modelo (e não como tool call) porque a
 * maior parte dos modelos gratuitos do OpenRouter não suporta tool calling —
 * assim o RAG funciona em todo o catálogo.
 */
export async function recuperarConhecimento(
  supabase: SupabaseClient,
  consulta: string,
  sigiloUsuario: NivelSigilo,
  modeloPermiteConfidencial: boolean,
): Promise<Recuperacao> {
  const vazio: Recuperacao = {
    contexto: null,
    citacoes: [],
    filtrouConfidencial: !modeloPermiteConfidencial,
  };

  const texto = consulta.trim();
  if (!texto || !process.env.OPENAI_API_KEY) return vazio;

  let embedding: number[];
  try {
    embedding = await gerarEmbedding(texto);
  } catch (erro) {
    // Falha de embedding não pode derrubar a conversa: sem base, o agente
    // segue respondendo com o que sabe.
    console.error('Falha ao gerar embedding da consulta:', erro);
    return vazio;
  }

  const { data, error } = await supabase.rpc('buscar_conhecimento', {
    consulta_embedding: paraVetorPg(embedding),
    consulta_texto: texto,
    sigilo_max: sigiloEfetivo(sigiloUsuario, modeloPermiteConfidencial),
    limite: LIMITE_FRAGMENTOS,
  });

  if (error) {
    console.error('Falha na busca da base de conhecimento:', error.message);
    return vazio;
  }

  const encontrados = (data as FragmentoEncontrado[]) ?? [];
  if (encontrados.length === 0) return vazio;

  const citacoes: Citacao[] = [];
  const blocos: string[] = [];

  encontrados.forEach((fragmento, indice) => {
    const numero = indice + 1;
    const marcas: string[] = [];

    if (fragmento.data_referencia) marcas.push(`referência: ${fragmento.data_referencia}`);
    if (fragmento.vigencia === 'rascunho') marcas.push('RASCUNHO, ainda não aprovado');
    if (fragmento.fonte_url) marcas.push(fragmento.fonte_url);

    blocos.push(
      `[${numero}] ${fragmento.titulo}${marcas.length ? ` (${marcas.join(' · ')})` : ''}\n${fragmento.conteudo}`,
    );

    citacoes.push({
      documento_id: fragmento.documento_id,
      titulo: fragmento.titulo,
      trecho: fragmento.conteudo.slice(0, 320),
    });
  });

  const contexto = [
    '# Base de conhecimento da Areesa',
    '',
    'Trechos recuperados dos documentos da agência para esta pergunta. Use-os como',
    'fonte preferencial sobre qualquer suposição sua.',
    '',
    'Regras de uso:',
    '- Cite a fonte com o número entre colchetes ao afirmar algo que veio daqui: [1], [2].',
    '- Se os trechos não respondem à pergunta, diga isso em vez de preencher a lacuna.',
    '- Trecho marcado como RASCUNHO ainda não foi aprovado; sinalize ao usá-lo.',
    '- Data de referência antiga merece ressalva: o documento pode estar desatualizado.',
    '',
    blocos.join('\n\n---\n\n'),
  ].join('\n');

  return { contexto, citacoes, filtrouConfidencial: !modeloPermiteConfidencial };
}
