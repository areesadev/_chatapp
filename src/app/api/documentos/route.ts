import { NextResponse, type NextRequest } from 'next/server';
import { exigirMaster } from '@/lib/permissoes';
import { criarClienteAdmin, registrarAuditoria } from '@/lib/supabase/admin';
import { formatoAceito } from '@/lib/conhecimento/extrair';
import type { NivelSigilo, TipoDocumento, VigenciaDocumento } from '@/lib/tipos';

const BUCKET = 'documentos';

/**
 * Gera uma URL assinada para o navegador enviar o arquivo direto ao Storage.
 *
 * O upload não passa por esta rota de propósito: funções serverless da Vercel
 * limitam o corpo da requisição a 4,5 MB, o que barraria a maior parte dos PDFs
 * e planilhas da agência.
 */
export async function PUT(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { nomeArquivo } = (await request.json()) as { nomeArquivo?: string };
  if (!nomeArquivo) {
    return NextResponse.json({ erro: 'Nome do arquivo não informado.' }, { status: 400 });
  }

  if (!formatoAceito(nomeArquivo)) {
    return NextResponse.json(
      { erro: 'Formato não suportado. Aceitos: PDF, DOCX, XLSX, XLS, CSV, TXT, MD e JSON.' },
      { status: 400 },
    );
  }

  const caminho = `${crypto.randomUUID()}/${sanitizarNome(nomeArquivo)}`;

  const { data, error } = await criarClienteAdmin()
    .storage.from(BUCKET)
    .createSignedUploadUrl(caminho);

  if (error || !data) {
    return NextResponse.json(
      { erro: error?.message ?? 'Falha ao preparar o upload.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ caminho: data.path, token: data.token, bucket: BUCKET });
}

interface CorpoDocumento {
  titulo?: string;
  tipo?: TipoDocumento;
  descricao?: string | null;
  fonteUrl?: string | null;
  storagePath?: string | null;
  mime?: string | null;
  tamanhoBytes?: number | null;
  conteudo?: string | null;
  sigilo?: NivelSigilo;
  vigencia?: VigenciaDocumento;
  dataReferencia?: string | null;
  tags?: string[];
}

/** Registra o documento e o deixa na fila de indexação. */
export async function POST(request: NextRequest) {
  const auth = await exigirMaster();
  if (!auth.ok) return NextResponse.json({ erro: auth.erro }, { status: auth.status });

  const { supabase, user } = auth.contexto;
  const corpo = (await request.json()) as CorpoDocumento;

  const titulo = corpo.titulo?.trim();
  const tipo = corpo.tipo;

  if (!titulo) return NextResponse.json({ erro: 'Informe um título.' }, { status: 400 });
  if (!tipo || !['arquivo', 'texto', 'link'].includes(tipo)) {
    return NextResponse.json({ erro: 'Tipo de documento inválido.' }, { status: 400 });
  }

  if (tipo === 'arquivo' && !corpo.storagePath) {
    return NextResponse.json({ erro: 'Arquivo não enviado.' }, { status: 400 });
  }
  if (tipo === 'texto' && !corpo.conteudo?.trim()) {
    return NextResponse.json({ erro: 'Cole o conteúdo do texto.' }, { status: 400 });
  }
  if (tipo === 'link' && !ehUrlValida(corpo.fonteUrl)) {
    return NextResponse.json({ erro: 'Informe uma URL http(s) válida.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('documentos')
    .insert({
      titulo,
      tipo,
      descricao: corpo.descricao?.trim() || null,
      fonte_url: tipo === 'link' ? corpo.fonteUrl : null,
      storage_path: tipo === 'arquivo' ? corpo.storagePath : null,
      mime: corpo.mime ?? null,
      tamanho_bytes: corpo.tamanhoBytes ?? null,
      conteudo_bruto: tipo === 'texto' ? corpo.conteudo : null,
      sigilo: corpo.sigilo ?? 'interno',
      vigencia: corpo.vigencia ?? 'vigente',
      // Sem data informada, assume hoje: um documento sem data de referência
      // some da ressalva de "fonte possivelmente desatualizada" na resposta.
      data_referencia: corpo.dataReferencia || hoje(),
      tags: corpo.tags ?? [],
      status: 'pendente',
      criado_por: user.id,
    })
    .select('id, titulo')
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await registrarAuditoria({
    usuario_id: user.id,
    acao: 'documento.criar',
    entidade: 'documentos',
    entidade_id: data.id,
    detalhes: { titulo, tipo, sigilo: corpo.sigilo ?? 'interno' },
  });

  return NextResponse.json(data, { status: 201 });
}

/** Data local em ISO curto (AAAA-MM-DD), formato aceito pela coluna `date`. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120);
}

function ehUrlValida(valor: string | null | undefined): boolean {
  if (!valor) return false;
  try {
    const url = new URL(valor);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
