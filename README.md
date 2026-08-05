# Areesa _cerebro

Diretor de Operações da Areesa. Sócios e diretores conversam com o agente
escolhendo o **modelo de IA** e a **skill** (o papel que ele assume) a cada
conversa, com a documentação da agência como fonte.

Next.js 15 + TypeScript + Supabase + Tailwind. Deploy na Vercel.

> O app Express anterior está preservado em [legacy/](legacy/) só como referência
> histórica. Ele não roda mais e não é importado por nada.

---

## O que a aplicação faz

**Chat** — streaming token a token, histórico persistente, raciocínio do modelo
expansível, parar geração no meio, compartilhar uma conversa com o time.

**Base de conhecimento** — upload de PDF, DOCX, XLSX, XLS, CSV, TXT, MD e JSON;
colar texto direto; cadastrar URLs. Cada documento tem nível de sigilo
(Público / Interno / Confidencial), vigência (Vigente / Rascunho / Obsoleto) e
data de referência. A busca é híbrida: vetorial para perguntas conceituais,
full-text em português para nome de cliente e código de projeto, fundidas por
Reciprocal Rank Fusion. Toda resposta apoiada na base mostra as fontes.

**Modelos** — Anthropic (Opus 5, Sonnet 5, Haiku 4.5) e o catálogo inteiro do
OpenRouter, importado sob demanda. Documento confidencial nunca é enviado a
modelo gratuito, mesmo para quem tem acesso a ele.

**Governança** — convites por e-mail com papel e nível de acesso, teto de gasto
mensal por pessoa, log de auditoria, edição da persona e das skills sem deploy.

**Ferramentas** — exportação de qualquer resposta para Word, Excel ou PDF; busca
na web nos dois provedores.

---

## 1. Configurar o Supabase

No **SQL Editor** do projeto, rode os arquivos na ordem:

| Arquivo | O que cria |
|---|---|
| [0001_schema.sql](supabase/migrations/0001_schema.sql) | Perfis, convites, skills, modelos, conversas, mensagens, auditoria e todo o RLS |
| [0002_seed.sql](supabase/migrations/0002_seed.sql) | Persona, as 6 skills e o catálogo Anthropic |
| [0003_conhecimento.sql](supabase/migrations/0003_conhecimento.sql) | pgvector, documentos, fragmentos, busca híbrida e o bucket de storage |

Em **Authentication → Providers**, deixe só **Email** ativo.

Em **Authentication → URL Configuration**:

| Campo | Valor |
|---|---|
| Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/**` |

O `/**` é necessário porque o callback carrega um parâmetro (`?destino=`) e uma
entrada exata não casaria com ele.

### E-mail

O SMTP padrão do Supabase entrega ~3 e-mails por hora — serve para testar, não
para uso diário. Configure um provedor real em **Authentication → Emails → SMTP
Settings** (Resend com o domínio `areesa.com.br` é o caminho mais curto) antes de
abrir o acesso para o time.

---

## 2. Variáveis de ambiente

```bash
cp .env.local.example .env.local
```

| Variável | Onde obter |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | idem |
| `SUPABASE_SECRET_KEY` | idem (`sb_secret_…`) — ignora o RLS, só em rotas de servidor |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENROUTER_API_KEY` | openrouter.ai/keys |
| `OPENAI_API_KEY` | platform.openai.com — **só** para embeddings, nunca para conversa |
| `NEXT_PUBLIC_APP_URL` | URL pública do app |
| `CRON_SECRET` | `openssl rand -hex 32` — protege o cron de indexação |

---

## 3. Rodar

```bash
npm install
npm run dev
```

Entre com **dev@areesa.com.br**. O trigger do banco reconhece esse e-mail e cria
o perfil como `master`, com acesso a documentos confidenciais e sem teto de
gasto.

---

## 4. Acesso e permissões

O login é **por convite**. Quem entra sem convite tem o perfil criado inativo e
para em `/acesso-pendente`.

O master convida em **Administração → Usuários**, definindo três coisas:

- **Papel** — `master`, `socio`, `diretor` ou `colaborador`
- **Acesso a documentos** — até Público, Interno ou Confidencial
- **Teto mensal** — em dólares; `0` significa sem limite

Conversas são privadas por padrão. O próprio autor decide compartilhar cada uma
com o time — nem o master lê conversa privada dos outros, isso está no RLS, não
só na interface.

---

## 5. Base de conhecimento

Em **Administração → Base de conhecimento**. O que vale saber antes de começar:

**O que não é lido.** PDF escaneado como imagem e página que só renderiza por
JavaScript retornam vazio — nesses casos, use a aba Texto e cole o conteúdo.

**Sigilo é uma trava real.** O nível efetivo de cada consulta é o menor entre o
que a pessoa pode ver e o que o modelo pode receber. Um sócio com acesso
confidencial conversando em modelo gratuito continua sem mandar contrato para
fora.

**Vigência resolve documentação velha.** Documento marcado como `Obsoleto` some
da busca. Marcado como `Rascunho`, é recuperado com aviso de que ainda não foi
aprovado. A data de referência aparece junto ao trecho, para o agente ressalvar
quando a fonte for antiga.

**Custo de indexação.** Embeddings via `text-embedding-3-small`, a US$ 0,02 por
milhão de tokens — indexar centenas de documentos custa centavos. Mas a conta da
OpenAI precisa ter crédito: sem saldo, a indexação falha e o painel mostra o
motivo.

---

## 6. Modelos

Os três da Anthropic vêm cadastrados. Para o Opus 5, as requisições vão com
fallback automático para o Opus 4.8 — se os classificadores de segurança
recusarem por falso positivo, a Anthropic reexecuta em outro modelo dentro da
mesma chamada. Sonnet e Haiku não aceitam esse parâmetro e não o recebem.

O catálogo do OpenRouter é importado em **Administração → Configurações →
Importar catálogo OpenRouter**. Os modelos entram **desativados** e sem acesso a
confidencial; ressincronizar não desfaz o que já foi ativado.

**Modelos gratuitos:** o provedor pode usar o conteúdo da conversa para
treinamento. O limite prático é de ~20 requisições/minuto e 200/dia por conta,
compartilhado por todos, já que a chave é única da agência. O roteador gratuito
sorteia o provedor a cada chamada — alguns são modelos de raciocínio que podem
gastar o orçamento de tokens pensando sem chegar a responder.

---

## 7. Deploy na Vercel

Importe o repositório, cadastre as mesmas variáveis e ajuste `NEXT_PUBLIC_APP_URL`.

Duas ressalvas do plano **Hobby**, ambas já contornadas no código:

- **Cron uma vez por dia.** O [vercel.json](vercel.json) agenda a indexação às
  03:00 UTC (meia-noite em Brasília). Isso não atrasa nada no uso normal: o
  painel dispara a indexação assim que o documento é cadastrado, e o cron é só
  a rede de segurança para quando o navegador é fechado no meio. Se algo ficar
  na fila, o botão **Processar fila** resolve na hora. No plano Pro, dá para
  voltar a `*/10 * * * *`.
- **Execução limitada a 60s.** As rotas de chat, indexação e exportação declaram
  `maxDuration = 60`. Respostas longas do Opus 5 e arquivos grandes passam
  disso — no Pro, suba para `300`.

---

## Estrutura

```
src/
├── app/
│   ├── (app)/
│   │   ├── chat/               conversa nova e existente
│   │   └── admin/              base, usuários e configurações (só master)
│   ├── api/
│   │   ├── chat/               streaming NDJSON, RAG, cobrança e persistência
│   │   ├── documentos/         upload assinado, CRUD e fila de indexação
│   │   ├── usuarios/           convites e permissões
│   │   ├── skills/ modelos/ configuracoes/
│   │   ├── exportar/           docx, xlsx e pdf
│   │   └── cron/indexar/       rede de segurança da fila
│   ├── auth/callback/          troca do magic link por sessão
│   └── login/
├── components/
│   ├── chat/                   chat, mensagem, seletores, boas-vindas
│   └── admin/                  painéis de base, usuários e configurações
├── lib/
│   ├── ia/                     camada unificada Anthropic + OpenRouter
│   ├── conhecimento/           extração, fragmentação, embeddings, busca
│   ├── exportar/               markdown → docx/xlsx/pdf
│   ├── supabase/               clientes browser, servidor e admin
│   ├── permissoes.ts           guardas de rota
│   ├── dados.ts                consultas de leitura
│   └── tipos.ts
└── middleware.ts               renovação de sessão e proteção de rotas
```
