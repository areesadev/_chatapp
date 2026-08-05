import ExcelJS from 'exceljs';

/** Formatos aceitos no upload, mapeados para o extrator correspondente. */
export const EXTENSOES_ACEITAS = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
  '.md',
  '.json',
] as const;

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto === -1 ? '' : nome.slice(ponto).toLowerCase();
}

export function formatoAceito(nome: string): boolean {
  return (EXTENSOES_ACEITAS as readonly string[]).includes(extensaoDe(nome));
}

/**
 * Converte o arquivo em texto puro para indexação.
 *
 * Planilhas viram tabelas em markdown porque o modelo lê linha a linha muito
 * melhor do que um despejo de células soltas.
 */
export async function extrairTexto(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<string> {
  switch (extensaoDe(nomeArquivo)) {
    case '.pdf':
      return extrairPdf(buffer);
    case '.docx':
      return extrairDocx(buffer);
    case '.xlsx':
    case '.xls':
      return extrairPlanilha(buffer);
    case '.csv':
      return extrairCsv(buffer.toString('utf-8'));
    case '.json':
      return formatarJson(buffer.toString('utf-8'));
    default:
      return buffer.toString('utf-8');
  }
}

async function extrairPdf(buffer: Buffer): Promise<string> {
  // unpdf roda sem worker externo, o que é o que torna a extração viável em
  // ambiente serverless.
  const { extractText, getDocumentProxy } = await import('unpdf');
  const documento = await getDocumentProxy(new Uint8Array(buffer));
  // mergePages junta as páginas numa string só; sem ele o retorno é string[].
  const { text } = await extractText(documento, { mergePages: true });
  return text;
}

async function extrairDocx(buffer: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function extrairPlanilha(buffer: Buffer): Promise<string> {
  const pasta = new ExcelJS.Workbook();
  // O tipo do exceljs pede ArrayBuffer; o Buffer do Node satisfaz em runtime.
  await pasta.xlsx.load(buffer as unknown as ArrayBuffer);

  const partes: string[] = [];

  for (const planilha of pasta.worksheets) {
    const linhas: string[][] = [];

    planilha.eachRow({ includeEmpty: false }, (linha) => {
      const celulas: string[] = [];
      linha.eachCell({ includeEmpty: true }, (celula) => {
        celulas.push(textoDaCelula(celula.value));
      });
      if (celulas.some((c) => c.trim() !== '')) linhas.push(celulas);
    });

    if (linhas.length === 0) continue;

    partes.push(`## ${planilha.name}\n\n${paraTabelaMarkdown(linhas)}`);
  }

  return partes.join('\n\n');
}

function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    if ('text' in valor && typeof valor.text === 'string') return valor.text;
    if ('result' in valor) return String(valor.result ?? '');
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((p) => p.text).join('');
    }
    return '';
  }
  return String(valor);
}

function extrairCsv(texto: string): string {
  const linhas = texto
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => dividirLinhaCsv(l));

  return linhas.length > 0 ? paraTabelaMarkdown(linhas) : '';
}

/** Divisão de CSV que respeita aspas e vírgulas dentro do campo. */
function dividirLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const caractere = linha[i];

    if (caractere === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if ((caractere === ',' || caractere === ';') && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += caractere;
    }
  }

  campos.push(atual);
  return campos.map((c) => c.trim());
}

function paraTabelaMarkdown(linhas: string[][]): string {
  const colunas = Math.max(...linhas.map((l) => l.length));
  const normalizar = (l: string[]) =>
    `| ${Array.from({ length: colunas }, (_, i) => (l[i] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;

  const [cabecalho, ...corpo] = linhas;
  const separador = `| ${Array.from({ length: colunas }, () => '---').join(' | ')} |`;

  return [normalizar(cabecalho), separador, ...corpo.map(normalizar)].join('\n');
}

function formatarJson(texto: string): string {
  try {
    return JSON.stringify(JSON.parse(texto), null, 2);
  } catch {
    return texto;
  }
}

/**
 * Busca o conteúdo de uma URL e devolve o texto legível.
 *
 * Extração por remoção de tags: sem dependência de headless browser, o que
 * significa que páginas renderizadas só por JavaScript não trazem conteúdo —
 * a interface avisa quando o resultado vem vazio demais.
 */
export async function extrairDeUrl(
  url: string,
): Promise<{ titulo: string | null; texto: string }> {
  const resposta = await fetch(url, {
    headers: { 'User-Agent': 'Areesa-cerebro/1.0 (indexador interno)' },
    redirect: 'follow',
  });

  if (!resposta.ok) {
    throw new Error(`A URL respondeu ${resposta.status}.`);
  }

  const tipo = resposta.headers.get('content-type') ?? '';

  if (tipo.includes('application/pdf')) {
    const buffer = Buffer.from(await resposta.arrayBuffer());
    return { titulo: null, texto: await extrairPdf(buffer) };
  }

  const html = await resposta.text();

  if (!tipo.includes('html')) {
    return { titulo: null, texto: html };
  }

  const tituloBruto = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { titulo: tituloBruto ? decodeURIComponent(tituloBruto.trim()) : null, texto };
}
