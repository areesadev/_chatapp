// Tipos do banco. Mantidos à mão para não depender do CLI do Supabase —
// se o schema em supabase/migrations mudar, ajuste aqui junto.

export type PapelUsuario = 'master' | 'socio' | 'diretor' | 'colaborador';
export type NivelSigilo = 'publico' | 'interno' | 'confidencial';
export type ProvedorIA = 'anthropic' | 'openrouter';
export type PapelMensagem = 'user' | 'assistant';

export interface Perfil {
  id: string;
  email: string;
  nome: string | null;
  papel: PapelUsuario;
  sigilo_maximo: NivelSigilo;
  /** 0 significa ilimitado. */
  limite_mensal_usd: number;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Skill {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  instrucoes: string;
  ordem: number;
  ativa: boolean;
}

export interface Modelo {
  id: string;
  provedor: ProvedorIA;
  model_id: string;
  nome_exibicao: string;
  descricao: string | null;
  gratuito: boolean;
  contexto: number | null;
  max_saida: number;
  custo_entrada_usd: number;
  custo_saida_usd: number;
  permite_confidencial: boolean;
  suporta_tools: boolean;
  ativo: boolean;
  ordem: number;
}

export interface Conversa {
  id: string;
  usuario_id: string;
  titulo: string;
  skill_id: string | null;
  modelo_id: string | null;
  compartilhada: boolean;
  arquivada: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Anexo {
  nome: string;
  tipo: string;
  tamanho: number;
}

export interface Citacao {
  documento_id: string;
  titulo: string;
  trecho: string;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  papel: PapelMensagem;
  conteudo: string;
  raciocinio: string | null;
  anexos: Anexo[];
  citacoes: Citacao[];
  modelo_usado: string | null;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd: number;
  erro: string | null;
  criado_em: string;
}

export type TipoDocumento = 'arquivo' | 'texto' | 'link';
export type VigenciaDocumento = 'vigente' | 'rascunho' | 'obsoleto';
export type StatusProcessamento = 'pendente' | 'processando' | 'indexado' | 'erro';

export interface Documento {
  id: string;
  titulo: string;
  tipo: TipoDocumento;
  descricao: string | null;
  fonte_url: string | null;
  storage_path: string | null;
  mime: string | null;
  tamanho_bytes: number | null;
  sigilo: NivelSigilo;
  vigencia: VigenciaDocumento;
  data_referencia: string | null;
  tags: string[];
  status: StatusProcessamento;
  erro_msg: string | null;
  total_fragmentos: number;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
  indexado_em: string | null;
}

export interface ConsumoMensal {
  usuario_id: string;
  mes: string;
  custo_usd: number;
  tokens_entrada: number;
  tokens_saida: number;
  mensagens: number;
}

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  master: 'Master',
  socio: 'Sócio',
  diretor: 'Diretor',
  colaborador: 'Colaborador',
};

export const ROTULO_SIGILO: Record<NivelSigilo, string> = {
  publico: 'Público',
  interno: 'Interno',
  confidencial: 'Confidencial',
};

export const ROTULO_VIGENCIA: Record<VigenciaDocumento, string> = {
  vigente: 'Vigente',
  rascunho: 'Rascunho',
  obsoleto: 'Obsoleto',
};

export const ROTULO_STATUS: Record<StatusProcessamento, string> = {
  pendente: 'Na fila',
  processando: 'Processando',
  indexado: 'Indexado',
  erro: 'Erro',
};

export const ROTULO_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  arquivo: 'Arquivo',
  texto: 'Texto',
  link: 'Link',
};
