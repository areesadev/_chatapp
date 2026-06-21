// server.js
require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Geração de arquivos
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n❌ Faltou a ANTHROPIC_API_KEY no arquivo .env\n');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.MODEL || 'claude-haiku-4-5-20251001';

// ─── Persona do assistente ─────────────────────────────────────────────────────
// Edite livremente o texto abaixo para ajustar a identidade do assistente.
const ASSISTANT_NAME = 'Assistente'; // ← troque o nome aqui

const SYSTEM_PROMPT = `
Você é ${ASSISTANT_NAME}, um assistente pessoal inteligente e prestativo.

Diretrizes de identidade:
- Nunca mencione espontaneamente os nomes "Claude", "Anthropic", "claude.ai" ou qualquer referência à empresa ou ao modelo subjacente.
- Se o usuário perguntar diretamente qual modelo de IA você é, qual empresa te criou ou qual tecnologia está por trás de você, responda de forma neutra, algo como: "Sou ${ASSISTANT_NAME}, um assistente configurado para este projeto. Não estou autorizado a divulgar detalhes técnicos sobre minha infraestrutura." Não confirme nem negue ser Claude ou qualquer outro modelo específico.
- Se o usuário colar trechos de logs, código ou mensagens de erro que já contenham esses termos, você pode referenciá-los contextualmente sem problema.
- Seja sempre direto, útil, claro e educado.
`.trim();

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Diretórios ────────────────────────────────────────────────────────────────
const DATA_DIR    = path.join(__dirname, 'data');
const CONV_DIR    = path.join(DATA_DIR, 'conversations');
const EXPORT_DIR  = path.join(DATA_DIR, 'exports');

[DATA_DIR, CONV_DIR, EXPORT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Limpeza automática (conversas + exports com mais de 7 dias) ───────────────
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function cleanupOldConversations() {
  try {
    for (const file of fs.readdirSync(CONV_DIR)) {
      if (!file.endsWith('.json')) continue;
      const fp = path.join(CONV_DIR, file);
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (Date.now() - data.updatedAt > SEVEN_DAYS) fs.unlinkSync(fp);
    }
  } catch (e) { console.error('Erro ao limpar conversas:', e.message); }
}

function cleanupOldExports() {
  try {
    for (const convFolder of fs.readdirSync(EXPORT_DIR)) {
      const fp = path.join(EXPORT_DIR, convFolder);
      if (!fs.statSync(fp).isDirectory()) continue;
      for (const file of fs.readdirSync(fp)) {
        const filePath = path.join(fp, file);
        const stat = fs.statSync(filePath);
        if (Date.now() - stat.mtimeMs > SEVEN_DAYS) fs.unlinkSync(filePath);
      }
      // Remove pasta se ficou vazia
      if (fs.readdirSync(fp).length === 0) fs.rmdirSync(fp);
    }
  } catch (e) { console.error('Erro ao limpar exports:', e.message); }
}

cleanupOldConversations();
cleanupOldExports();

// ─── Helpers de conversa ───────────────────────────────────────────────────────
function getConversation(id) {
  const fp = path.join(CONV_DIR, `${id}.json`);
  return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : null;
}

function saveConversation(conv) {
  fs.writeFileSync(path.join(CONV_DIR, `${conv.id}.json`), JSON.stringify(conv, null, 2));
}

// ─── Detecção de intenção de exportação ───────────────────────────────────────
const EXPORT_PATTERNS = {
  docx: [
    /\b(gera|cria|manda|exporta|faz|quero|me\s+d[áa])\b.{0,60}\b(docx?|word|documento\s+word|documento\s+de\s+texto)\b/i,
    /\bdocx?\b/i,
    /\bword\b.{0,30}\b(arquivo|documento|exporta|gera|cria)\b/i,
  ],
  xlsx: [
    /\b(gera|cria|manda|exporta|faz|quero|me\s+d[áa])\b.{0,60}\b(xlsx?|excel|planilha|spreadsheet)\b/i,
    /\bxlsx?\b/i,
    /\bplanilha\b/i,
    /\bexcel\b.{0,30}\b(arquivo|exporta|gera|cria)\b/i,
  ],
  pdf: [
    /\b(gera|cria|manda|exporta|faz|quero|me\s+d[áa])\b.{0,60}\bpdf\b/i,
    /\bpdf\b/i,
  ],
};

function detectExportType(text) {
  for (const [type, patterns] of Object.entries(EXPORT_PATTERNS)) {
    if (patterns.some(p => p.test(text))) return type;
  }
  return null;
}

// ─── System prompts de exportação ─────────────────────────────────────────────
const EXPORT_SYSTEM = {
  docx: `Você é um assistente que DEVE responder SOMENTE com conteúdo em Markdown estruturado.
Use # para título principal, ## para seções, ### para subseções.
Use **negrito** para destaques, listas com - ou 1., tabelas em markdown quando fizer sentido.
Não inclua explicações fora do documento. Responda diretamente com o conteúdo solicitado em Markdown.`,

  xlsx: `Você é um assistente que DEVE responder SOMENTE com um JSON válido e nada mais.
O JSON deve seguir exatamente este formato:
{"sheetName":"Nome da Planilha","headers":["Col1","Col2","Col3"],"rows":[["val1","val2","val3"],["val4","val5","val6"]]}
Não inclua texto antes ou depois do JSON. Responda APENAS com o JSON.`,

  pdf: `Você é um assistente que DEVE responder SOMENTE com conteúdo em Markdown estruturado.
Use # para título principal, ## para seções, ### para subseções.
Use **negrito** para destaques e listas com - ou 1.
Não inclua explicações fora do documento. Responda diretamente com o conteúdo solicitado em Markdown.`,
};

// ─── Geradores de arquivo ──────────────────────────────────────────────────────

function suggestFilename(userText, ext) {
  const base = userText
    .replace(/[^a-zA-Z0-9\sáéíóúãõâêôàç]/gi, '')
    .trim()
    .substring(0, 30)
    .trim()
    .replace(/\s+/g, '_') || 'documento';
  return `${base}.${ext}`;
}

// Converte Markdown simples em parágrafos/headings do docx
function markdownToDocxParagraphs(markdown) {
  const lines = markdown.split('\n');
  const paragraphs = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Headings
    const h3 = trimmed.match(/^###\s+(.*)/);
    const h2 = trimmed.match(/^##\s+(.*)/);
    const h1 = trimmed.match(/^#\s+(.*)/);
    if (h1) { paragraphs.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 })); continue; }
    if (h2) { paragraphs.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 })); continue; }
    if (h3) { paragraphs.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 })); continue; }

    // Listas
    const ul = trimmed.match(/^[-*]\s+(.*)/);
    const ol = trimmed.match(/^\d+\.\s+(.*)/);
    if (ul) { paragraphs.push(new Paragraph({ text: ul[1], bullet: { level: 0 } })); continue; }
    if (ol) { paragraphs.push(new Paragraph({ text: ol[1], numbering: { reference: 'default-numbering', level: 0 } })); continue; }

    // Linhas de tabela Markdown — ignoramos formatação da tabela, só o conteúdo
    if (trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c && c !== '---' && !c.match(/^-+$/));
      if (cells.length) {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: cells.join('   '), bold: false })] }));
      }
      continue;
    }

    // Parágrafo com negrito inline
    const runs = parseInlineMarkdown(trimmed);
    paragraphs.push(new Paragraph({ children: runs }));
  }

  return paragraphs;
}

function parseInlineMarkdown(text) {
  const runs = [];
  const regex = /\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|(.+?)(?=\*\*|__|`|$)/gs;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] || match[2]) runs.push(new TextRun({ text: match[1] || match[2], bold: true }));
    else if (match[3]) runs.push(new TextRun({ text: match[3], font: 'Courier New' }));
    else if (match[4]) runs.push(new TextRun({ text: match[4] }));
  }
  return runs.length ? runs : [new TextRun({ text })];
}

async function generateDocx(markdown, outputPath) {
  const paragraphs = markdownToDocxParagraphs(markdown);
  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

async function generateXlsx(jsonText, outputPath) {
  let data;
  // Tenta extrair JSON mesmo que Claude tenha adicionado texto ao redor
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON não encontrado na resposta');
  data = JSON.parse(jsonMatch[0]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(data.sheetName || 'Planilha');

  // Cabeçalho em negrito
  const headerRow = sheet.addRow(data.headers || []);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E5E0' } };

  // Dados
  (data.rows || []).forEach(row => sheet.addRow(row));

  // Auto-largura aproximada
  sheet.columns.forEach(col => { col.width = 18; });

  await workbook.xlsx.writeFile(outputPath);
}

function generatePdf(markdown, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    doc.registerFont('Regular', path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'data', 'Helvetica.afm'));

    const lines = markdown.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { doc.moveDown(0.4); continue; }

      const h1 = trimmed.match(/^#\s+(.*)/);
      const h2 = trimmed.match(/^##\s+(.*)/);
      const h3 = trimmed.match(/^###\s+(.*)/);
      const ul = trimmed.match(/^[-*]\s+(.*)/);
      const ol = trimmed.match(/^\d+\.\s+(.*)/);

      if (h1) { doc.moveDown(0.5).fontSize(20).font('Helvetica-Bold').text(h1[1]).font('Helvetica').fontSize(11).moveDown(0.3); }
      else if (h2) { doc.moveDown(0.4).fontSize(15).font('Helvetica-Bold').text(h2[1]).font('Helvetica').fontSize(11).moveDown(0.2); }
      else if (h3) { doc.moveDown(0.3).fontSize(12).font('Helvetica-Bold').text(h3[1]).font('Helvetica').fontSize(11).moveDown(0.2); }
      else if (ul) { doc.fontSize(11).text(`• ${ul[1]}`, { indent: 15 }); }
      else if (ol) { doc.fontSize(11).text(trimmed, { indent: 15 }); }
      else {
        // Remove markdown inline simples
        const clean = trimmed.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`(.+?)`/g, '$1');
        doc.fontSize(11).text(clean, { lineGap: 2 });
      }
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ─── Detecção de tipo de arquivo ───────────────────────────────────────────────
function detectMediaType(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  return { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || null;
}

// ─── Rotas de conversas ────────────────────────────────────────────────────────
app.get('/api/conversations', (req, res) => {
  cleanupOldConversations();
  try {
    const convs = fs.readdirSync(CONV_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const d = JSON.parse(fs.readFileSync(path.join(CONV_DIR, f), 'utf-8'));
        return { id: d.id, title: d.title, updatedAt: d.updatedAt };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(convs);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar conversas.' }); }
});

app.get('/api/conversations/:id', (req, res) => {
  const conv = getConversation(req.params.id);
  conv ? res.json(conv) : res.status(404).json({ error: 'Conversa não encontrada.' });
});

app.delete('/api/conversations/:id', (req, res) => {
  const fp = path.join(CONV_DIR, `${req.params.id}.json`);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ success: true }); }
  else res.status(404).json({ error: 'Conversa não encontrada.' });
});

// ─── Rota de download de exports ──────────────────────────────────────────────
app.get('/api/exports/:conversationId/:filename', (req, res) => {
  const { conversationId, filename } = req.params;
  // Sanitiza para evitar path traversal
  const safeName = path.basename(filename);
  const safeConv = path.basename(conversationId);
  const filePath = path.join(EXPORT_DIR, safeConv, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  res.download(filePath, safeName);
});

// ─── Rota principal de chat ────────────────────────────────────────────────────
app.post('/api/chat', upload.array('files'), async (req, res) => {
  try {
    const userText = (req.body.message || '').trim();
    let conversationId = req.body.conversationId;
    const files = req.files || [];

    if (!userText && files.length === 0) return res.status(400).json({ error: 'Mensagem vazia.' });

    // Carrega ou cria conversa
    let conv = null;
    const now = Date.now();
    if (conversationId && conversationId !== 'null' && conversationId !== 'undefined') {
      conv = getConversation(conversationId);
    }
    if (!conv) {
      const id = crypto.randomUUID();
      let title = userText.substring(0, 40);
      if (userText.length > 40) title += '...';
      if (!title) title = 'Nova conversa (Arquivos)';
      conv = { id, title, createdAt: now, updatedAt: now, messages: [] };
      conversationId = id;
    }

    // Monta conteúdo da mensagem do usuário
    const content = [];
    for (const file of files) {
      const mediaType = detectMediaType(file.originalname);
      const base64 = file.buffer.toString('base64');
      if (mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } });
      else if (mediaType?.startsWith('image/')) content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
      else content.push({ type: 'text', text: `[Arquivo anexado: ${file.originalname}]\n${file.buffer.toString('utf-8')}` });
    }
    if (userText) content.push({ type: 'text', text: userText });

    conv.messages.push({ role: 'user', content });

    // Detecta se é pedido de exportação
    const exportType = detectExportType(userText);

    let replyText;
    let downloadMarker = null;

    if (exportType) {
      // Chamada especial com system prompt de exportação (sem histórico para não confundir o formato)
      // Combina o system prompt de persona com as instruções de formato de exportação
      const combinedSystem = `${SYSTEM_PROMPT}\n\n---\n\n${EXPORT_SYSTEM[exportType]}`;

      const exportResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: combinedSystem,
        messages: [{ role: 'user', content }],
      });

      const rawContent = exportResponse.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

      try {
        const exportFolder = path.join(EXPORT_DIR, conv.id);
        if (!fs.existsSync(exportFolder)) fs.mkdirSync(exportFolder, { recursive: true });

        const filename = `${Date.now()}-${suggestFilename(userText, exportType)}`;
        const outputPath = path.join(exportFolder, filename);

        if (exportType === 'docx') await generateDocx(rawContent, outputPath);
        else if (exportType === 'xlsx') await generateXlsx(rawContent, outputPath);
        else if (exportType === 'pdf') await generatePdf(rawContent, outputPath);

        const downloadUrl = `/api/exports/${conv.id}/${filename}`;
        replyText = `Arquivo gerado com sucesso!`;
        downloadMarker = `[DOWNLOAD:${filename}:${downloadUrl}]`;
      } catch (genErr) {
        console.error(`Erro ao gerar ${exportType}:`, genErr.message);
        // Fallback: entrega o texto bruto sem quebrar o chat
        replyText = rawContent;
      }
    } else {
      // Chamada normal com histórico completo
      const webSearch = req.body.webSearch !== 'false'; // habilitado por padrão
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: conv.messages,
        ...(webSearch && { tools: [{ type: 'web_search_20250305', name: 'web_search' }] }),
      });

      const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
      replyText = textBlocks.join('\n\n');
      conv.messages.push({ role: 'assistant', content: response.content });
    }

    if (exportType) {
      // Para exports, adiciona uma mensagem sintética ao histórico
      conv.messages.push({ role: 'assistant', content: [{ type: 'text', text: replyText + (downloadMarker || '') }] });
    }

    conv.updatedAt = Date.now();
    saveConversation(conv);

    res.json({ reply: replyText, downloadMarker, conversationId: conv.id });
  } catch (err) {
    console.error('Erro na chamada à API:', err.message);
    res.status(500).json({ error: 'Algo deu errado ao falar com a IA. Tenta de novo.' });
  }
});

app.post('/api/reset', (req, res) => res.json({ ok: true }));

// Apaga TODAS as conversas (queima de arquivo)
app.delete('/api/conversations', (req, res) => {
  try {
    const files = fs.readdirSync(CONV_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) fs.unlinkSync(path.join(CONV_DIR, file));
    }
    // Limpa exports também
    if (fs.existsSync(EXPORT_DIR)) {
      const folders = fs.readdirSync(EXPORT_DIR);
      for (const folder of folders) {
        const fp = path.join(EXPORT_DIR, folder);
        if (fs.statSync(fp).isDirectory()) {
          fs.readdirSync(fp).forEach(f => fs.unlinkSync(path.join(fp, f)));
          fs.rmdirSync(fp);
        }
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Erro ao apagar tudo:', e.message);
    res.status(500).json({ error: 'Falha ao apagar histórico.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`   Modelo: ${MODEL}\n`);
});
