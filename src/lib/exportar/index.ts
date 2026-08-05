import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type FormatoExportacao = 'docx' | 'xlsx' | 'pdf';

export const TIPOS_MIME: Record<FormatoExportacao, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/* ─── Análise do markdown ─────────────────────────────────────────────────── */

interface Bloco {
  tipo: 'titulo' | 'paragrafo' | 'lista' | 'tabela' | 'codigo';
  nivel?: number;
  texto?: string;
  itens?: string[];
  linhas?: string[][];
}

/**
 * Converte a resposta em blocos estruturados.
 *
 * O app anterior detectava a intenção de exportar por regex na mensagem do
 * usuário e regerava o conteúdo do zero — a palavra "planilha" no meio de uma
 * frase disparava a exportação e o histórico era descartado. Aqui a conversão
 * parte do texto que já foi gerado, acionada por um botão explícito.
 */
export function analisarMarkdown(markdown: string): Bloco[] {
  const blocos: Bloco[] = [];
  const linhas = markdown.replace(/\r\n/g, '\n').split('\n');

  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];
    const limpa = linha.trim();

    if (!limpa) {
      i++;
      continue;
    }

    // Bloco de código
    if (limpa.startsWith('```')) {
      const conteudo: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith('```')) {
        conteudo.push(linhas[i]);
        i++;
      }
      i++;
      blocos.push({ tipo: 'codigo', texto: conteudo.join('\n') });
      continue;
    }

    // Título
    const titulo = limpa.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      blocos.push({ tipo: 'titulo', nivel: titulo[1].length, texto: limparInline(titulo[2]) });
      i++;
      continue;
    }

    // Tabela: precisa da linha separadora logo abaixo do cabeçalho
    if (limpa.startsWith('|') && linhas[i + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
      const linhasTabela: string[][] = [celulasDe(limpa)];
      i += 2;
      while (i < linhas.length && linhas[i].trim().startsWith('|')) {
        linhasTabela.push(celulasDe(linhas[i].trim()));
        i++;
      }
      blocos.push({ tipo: 'tabela', linhas: linhasTabela });
      continue;
    }

    // Lista
    if (/^([-*+]|\d+\.)\s+/.test(limpa)) {
      const itens: string[] = [];
      while (i < linhas.length && /^([-*+]|\d+\.)\s+/.test(linhas[i].trim())) {
        itens.push(limparInline(linhas[i].trim().replace(/^([-*+]|\d+\.)\s+/, '')));
        i++;
      }
      blocos.push({ tipo: 'lista', itens });
      continue;
    }

    // Parágrafo: junta linhas até a próxima linha em branco
    const paragrafo: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|\||```|[-*+]\s|\d+\.\s)/.test(linhas[i].trim())) {
      paragrafo.push(linhas[i].trim());
      i++;
    }
    if (paragrafo.length > 0) {
      blocos.push({ tipo: 'paragrafo', texto: limparInline(paragrafo.join(' ')) });
    } else {
      i++;
    }
  }

  return blocos;
}

function celulasDe(linha: string): string[] {
  return linha
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => limparInline(c.trim()));
}

/** Remove marcação inline — os formatos de saída aplicam o estilo por conta. */
function limparInline(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)');
}

/* ─── DOCX ────────────────────────────────────────────────────────────────── */

export async function gerarDocx(markdown: string, titulo: string): Promise<Buffer> {
  const blocos = analisarMarkdown(markdown);
  const filhos: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: titulo, bold: true, size: 32 })],
      spacing: { after: 300 },
    }),
  ];

  const niveis = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];

  for (const bloco of blocos) {
    switch (bloco.tipo) {
      case 'titulo':
        filhos.push(
          new Paragraph({
            text: bloco.texto ?? '',
            heading: niveis[(bloco.nivel ?? 1) - 1],
            spacing: { before: 240, after: 120 },
          }),
        );
        break;

      case 'paragrafo':
        filhos.push(new Paragraph({ text: bloco.texto ?? '', spacing: { after: 140 } }));
        break;

      case 'lista':
        for (const item of bloco.itens ?? []) {
          filhos.push(new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 60 } }));
        }
        break;

      case 'codigo':
        filhos.push(
          new Paragraph({
            children: [new TextRun({ text: bloco.texto ?? '', font: 'Courier New', size: 18 })],
            spacing: { after: 140 },
          }),
        );
        break;

      case 'tabela': {
        const linhas = bloco.linhas ?? [];
        if (linhas.length === 0) break;

        filhos.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: linhas.map(
              (linha, indice) =>
                new TableRow({
                  children: linha.map(
                    (celula) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: celula, bold: indice === 0 })],
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
        );
        filhos.push(new Paragraph({ text: '', spacing: { after: 140 } }));
        break;
      }
    }
  }

  const documento = new Document({ sections: [{ children: filhos }] });
  return Buffer.from(await Packer.toBuffer(documento));
}

/* ─── XLSX ────────────────────────────────────────────────────────────────── */

/**
 * Cada tabela do markdown vira uma aba. Sem tabela nenhuma, o texto vai para
 * uma aba única — melhor do que devolver uma planilha vazia.
 */
export async function gerarXlsx(markdown: string, titulo: string): Promise<Buffer> {
  const blocos = analisarMarkdown(markdown);
  const tabelas = blocos.filter((b) => b.tipo === 'tabela');
  const pasta = new ExcelJS.Workbook();

  pasta.creator = 'Areesa _cerebro';
  pasta.created = new Date();

  if (tabelas.length === 0) {
    const aba = pasta.addWorksheet('Conteúdo');
    aba.columns = [{ header: titulo, key: 'linha', width: 110 }];
    aba.getRow(1).font = { bold: true };

    for (const bloco of blocos) {
      if (bloco.tipo === 'lista') {
        for (const item of bloco.itens ?? []) aba.addRow({ linha: `• ${item}` });
      } else if (bloco.texto) {
        aba.addRow({ linha: bloco.texto });
      }
    }

    aba.getColumn(1).alignment = { wrapText: true, vertical: 'top' };
    return Buffer.from(await pasta.xlsx.writeBuffer());
  }

  tabelas.forEach((tabela, indice) => {
    const linhas = tabela.linhas ?? [];
    const aba = pasta.addWorksheet(`Tabela ${indice + 1}`);

    linhas.forEach((linha, posicao) => {
      const adicionada = aba.addRow(linha);
      if (posicao === 0) adicionada.font = { bold: true };
    });

    aba.columns.forEach((coluna) => {
      let maior = 12;
      coluna.eachCell?.({ includeEmpty: false }, (celula) => {
        maior = Math.max(maior, String(celula.value ?? '').length + 2);
      });
      coluna.width = Math.min(maior, 60);
    });
  });

  return Buffer.from(await pasta.xlsx.writeBuffer());
}

/* ─── PDF ─────────────────────────────────────────────────────────────────── */

export function gerarPdf(markdown: string, titulo: string): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    const blocos = analisarMarkdown(markdown);
    const documento = new PDFDocument({ size: 'A4', margin: 56 });
    const pedacos: Buffer[] = [];

    documento.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    documento.on('end', () => resolver(Buffer.concat(pedacos)));
    documento.on('error', rejeitar);

    documento.font('Helvetica-Bold').fontSize(18).text(titulo);
    documento.moveDown(1);

    const largura = documento.page.width - 112;

    for (const bloco of blocos) {
      switch (bloco.tipo) {
        case 'titulo':
          documento
            .moveDown(0.6)
            .font('Helvetica-Bold')
            .fontSize(bloco.nivel === 1 ? 15 : bloco.nivel === 2 ? 13 : 11.5)
            .text(bloco.texto ?? '', { width: largura });
          documento.moveDown(0.3);
          break;

        case 'paragrafo':
          documento
            .font('Helvetica')
            .fontSize(10.5)
            .text(bloco.texto ?? '', { width: largura, align: 'left' });
          documento.moveDown(0.5);
          break;

        case 'lista':
          documento.font('Helvetica').fontSize(10.5);
          for (const item of bloco.itens ?? []) {
            documento.text(`•  ${item}`, { width: largura - 12, indent: 12 });
          }
          documento.moveDown(0.5);
          break;

        case 'codigo':
          documento
            .font('Courier')
            .fontSize(9)
            .text(bloco.texto ?? '', { width: largura });
          documento.moveDown(0.5);
          break;

        case 'tabela': {
          // Tabela em PDF sem biblioteca de layout: colunas de largura fixa,
          // suficiente para relatórios curtos.
          const linhas = bloco.linhas ?? [];
          if (linhas.length === 0) break;

          const colunas = Math.max(...linhas.map((l) => l.length));
          const larguraColuna = largura / colunas;

          linhas.forEach((linha, indice) => {
            documento.font(indice === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
            const y = documento.y;
            let maiorAltura = 0;

            linha.forEach((celula, coluna) => {
              const x = 56 + coluna * larguraColuna;
              const altura = documento.heightOfString(celula, { width: larguraColuna - 8 });
              maiorAltura = Math.max(maiorAltura, altura);
              documento.text(celula, x, y, { width: larguraColuna - 8 });
            });

            documento.y = y + maiorAltura + 6;
            documento.x = 56;
          });

          documento.moveDown(0.6);
          break;
        }
      }
    }

    documento.end();
  });
}

/** Nome de arquivo previsível e seguro, derivado do título da conversa. */
export function nomeDeArquivo(titulo: string, formato: FormatoExportacao): string {
  const base =
    titulo
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
      .toLowerCase() || 'areesa-cerebro';

  const data = new Date().toISOString().slice(0, 10);
  return `${data}-${base}.${formato}`;
}
