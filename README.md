# Chat privado — instruções rápidas

App de chat simples, rodando local na sua máquina, com busca na web e upload de arquivo.
Sem login (uso combinado: só você compartilha o link com a pessoa).

## 1. Configurar (uma vez só)

```bash
cd chatapp
npm install
cp .env.example .env
```

Abra o arquivo `.env` e cole sua API key da Anthropic na linha `ANTHROPIC_API_KEY=`
(gere uma em https://console.anthropic.com/settings/keys se ainda não tiver).

## 2. Rodar o servidor

```bash
node server.js
```

Deixa esse terminal aberto. Vai aparecer:
`✅ Servidor rodando em http://localhost:3000`

Teste abrindo esse link no seu próprio navegador primeiro.

## 3. Criar o túnel (pra outra pessoa acessar)

Em outro terminal (sem fechar o anterior), escolha uma opção:

### Opção A — Cloudflare Tunnel (recomendado, sem cadastro)
```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```
Ele vai te dar um link tipo `https://algo-aleatorio.trycloudflare.com` — manda esse link pra pessoa.

### Opção B — ngrok
```bash
brew install ngrok
ngrok http 3000
```
Ele te dá um link tipo `https://abcd1234.ngrok-free.app`.

## 4. Quando acabar (depois dos 2 dias)

- Aperta `Ctrl+C` nos dois terminais (servidor e túnel).
- O link para de funcionar na hora.
- Nenhum dado fica salvo em disco — a conversa só existe na memória do processo enquanto ele roda.

## Notas de segurança
- Não tem login: qualquer um com o link acessa. Mande o link só pra pessoa certa, por um canal privado (não em grupo público).
- A pessoa só consegue ver a conversa atual — não tem como ela ver conversas antigas suas, porque cada reinício zera o histórico.
- O arquivo `.env` tem sua API key — não suba ele pra nenhum lugar público (já está fora do controle de versão por padrão, se você usar git).
