'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mensagem, type MensagemVisivel } from './mensagem';
import { Seletores } from './seletores';
import { BoasVindas } from './boas-vindas';
import type { Citacao, Modelo, Skill } from '@/lib/tipos';

interface Props {
  conversaIdInicial: string | null;
  mensagensIniciais: MensagemVisivel[];
  skills: Skill[];
  modelos: Modelo[];
  skillIdInicial: string | null;
  modeloIdInicial: string | null;
  compartilhadaInicial?: boolean;
  nomeUsuario: string;
}

interface OpcoesEnvio {
  /** Apaga esta mensagem e as seguintes antes de gravar a nova. */
  substituirAPartirDe?: string;
}

/** Teto do campo de digitação, em pixels, antes de a rolagem entrar. */
const ALTURA_MAXIMA_CAMPO = 260;

export function Chat({
  conversaIdInicial,
  mensagensIniciais,
  skills,
  modelos,
  skillIdInicial,
  modeloIdInicial,
  compartilhadaInicial = false,
  nomeUsuario,
}: Props) {
  const router = useRouter();

  const [conversaId, setConversaId] = useState(conversaIdInicial);
  const [mensagens, setMensagens] = useState<MensagemVisivel[]>(mensagensIniciais);
  const [entrada, setEntrada] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);
  const [skillId, setSkillId] = useState(skillIdInicial);
  const [modeloId, setModeloId] = useState(modeloIdInicial ?? modelos[0]?.id ?? null);
  const [buscaWeb, setBuscaWeb] = useState(false);
  const [compartilhada, setCompartilhada] = useState(compartilhadaInicial);

  const abortadorRef = useRef<AbortController | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: gerando ? 'auto' : 'smooth' });
  }, [mensagens, gerando]);

  // Altura do campo acompanha o conteúdo, até um teto. A rolagem só entra
  // depois do teto — senão a barra aparece por arredondamento de subpixel.
  useEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    campo.style.height = 'auto';
    const desejada = campo.scrollHeight;
    campo.style.height = `${Math.min(desejada, ALTURA_MAXIMA_CAMPO)}px`;
    campo.style.overflowY = desejada > ALTURA_MAXIMA_CAMPO ? 'auto' : 'hidden';
  }, [entrada]);

  useEffect(() => () => abortadorRef.current?.abort(), []);

  const enviar = useCallback(
    async (texto: string, opcoes: OpcoesEnvio = {}) => {
      const conteudo = texto.trim();
      if (!conteudo || gerando || !modeloId) return;

      setErroGlobal(null);
      setGerando(true);

      const idProvisorio = `local-${Date.now()}`;
      const idResposta = `${idProvisorio}-resposta`;

      setMensagens((atuais) => {
        // Ao editar ou refazer, tudo a partir do ponto substituído sai da tela
        // antes de a nova resposta começar a chegar.
        const base = opcoes.substituirAPartirDe
          ? atuais.slice(0, atuais.findIndex((m) => m.id === opcoes.substituirAPartirDe))
          : atuais;

        return [
          ...base,
          { id: idProvisorio, papel: 'user', conteudo },
          { id: idResposta, papel: 'assistant', conteudo: '' },
        ];
      });

      const abortador = new AbortController();
      abortadorRef.current = abortador;

      const atualizar = (id: string, mudanca: Partial<MensagemVisivel>) =>
        setMensagens((atuais) => atuais.map((m) => (m.id === id ? { ...m, ...mudanca } : m)));

      try {
        const resposta = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortador.signal,
          body: JSON.stringify({
            mensagem: conteudo,
            conversaId,
            skillId,
            modeloId,
            buscaWeb,
            substituirAPartirDe: opcoes.substituirAPartirDe ?? null,
          }),
        });

        if (!resposta.ok) {
          const corpo = await resposta.json().catch(() => ({}));
          throw new Error(corpo.erro ?? `Falha na requisição (${resposta.status}).`);
        }
        if (!resposta.body) throw new Error('Resposta sem corpo.');

        const leitor = resposta.body.getReader();
        const decodificador = new TextDecoder();
        let buffer = '';
        let acumuladoTexto = '';
        let acumuladoRaciocinio = '';

        while (true) {
          const { done, value } = await leitor.read();
          if (done) break;

          buffer += decodificador.decode(value, { stream: true });
          const linhas = buffer.split('\n');
          buffer = linhas.pop() ?? '';

          for (const linha of linhas) {
            if (!linha.trim()) continue;

            let evento: Record<string, unknown>;
            try {
              evento = JSON.parse(linha);
            } catch {
              continue;
            }

            switch (evento.tipo) {
              case 'conversa': {
                const id = evento.id as string;
                if (evento.nova) {
                  setConversaId(id);
                  // history.replaceState em vez de router.replace: navegar
                  // remontaria o componente e cortaria o stream em andamento.
                  window.history.replaceState(null, '', `/chat/${id}`);
                }
                // Id real da pergunta — é o que habilita editá-la depois.
                const idUsuario = evento.mensagemUsuarioId as string | null;
                if (idUsuario) atualizar(idProvisorio, { id: idUsuario });
                break;
              }
              case 'citacoes':
                atualizar(idResposta, { citacoes: evento.citacoes as Citacao[] });
                break;
              case 'modelo':
                // Com roteador do OpenRouter, quem respondeu só se sabe agora.
                atualizar(idResposta, { modelo: evento.nome as string });
                break;
              case 'texto':
                acumuladoTexto += evento.texto as string;
                atualizar(idResposta, { conteudo: acumuladoTexto });
                break;
              case 'raciocinio':
                acumuladoRaciocinio += evento.texto as string;
                atualizar(idResposta, { raciocinio: acumuladoRaciocinio });
                break;
              case 'erro':
                atualizar(idResposta, { erro: evento.mensagem as string });
                break;
              case 'fim': {
                const idReal = evento.mensagemId as string | null;
                if (idReal) atualizar(idResposta, { id: idReal });
                break;
              }
            }
          }
        }
      } catch (erro) {
        if (abortador.signal.aborted) {
          atualizar(idResposta, { erro: 'Geração interrompida.' });
        } else {
          const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado.';
          setErroGlobal(mensagem);
          setMensagens((atuais) => atuais.filter((m) => m.id !== idResposta));
        }
      } finally {
        setGerando(false);
        abortadorRef.current = null;
        router.refresh();
      }
    },
    [buscaWeb, conversaId, gerando, modeloId, router, skillId],
  );

  /** Reenvia a pergunta editada, descartando o que veio depois dela. */
  function editar(mensagemId: string, novoTexto: string) {
    void enviar(novoTexto, { substituirAPartirDe: mensagemId });
  }

  /** Refaz a resposta a partir da pergunta imediatamente anterior a ela. */
  function refazer(indiceResposta: number) {
    for (let i = indiceResposta - 1; i >= 0; i--) {
      const anterior = mensagens[i];
      if (anterior.papel === 'user' && !anterior.id.startsWith('local-')) {
        void enviar(anterior.conteudo, { substituirAPartirDe: anterior.id });
        return;
      }
    }
    setErroGlobal('Não foi possível identificar a pergunta que originou esta resposta.');
  }

  async function alternarCompartilhamento() {
    if (!conversaId) return;

    const novoValor = !compartilhada;
    setCompartilhada(novoValor);

    const resposta = await fetch(`/api/conversas/${conversaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compartilhada: novoValor }),
    });

    if (!resposta.ok) {
      setCompartilhada(!novoValor);
      setErroGlobal('Não foi possível alterar o compartilhamento.');
    }
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      const texto = entrada;
      setEntrada('');
      void enviar(texto);
    }
  }

  function enviarDoCampo() {
    const texto = entrada;
    setEntrada('');
    void enviar(texto);
  }

  const semModelos = modelos.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {conversaId && (
        <header className="flex items-center justify-end border-b border-borda px-6 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-texto-suave">
            <input type="checkbox" checked={compartilhada} onChange={alternarCompartilhamento} />
            {compartilhada ? 'Compartilhada com o time' : 'Compartilhar com o time'}
          </label>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8">
          {mensagens.length === 0 ? (
            <BoasVindas
              nome={nomeUsuario}
              skills={skills}
              aoEscolher={(skill, sugestao) => {
                setSkillId(skill.id);
                setEntrada(sugestao);
                campoRef.current?.focus();
              }}
            />
          ) : (
            mensagens.map((mensagem, indice) => {
              const ehUltima = indice === mensagens.length - 1;
              return (
                <Mensagem
                  key={mensagem.id}
                  mensagem={mensagem}
                  gerando={gerando && ehUltima && mensagem.papel === 'assistant'}
                  bloqueado={gerando}
                  aoEditar={editar}
                  aoRefazer={
                    mensagem.papel === 'assistant' && !gerando
                      ? () => refazer(indice)
                      : undefined
                  }
                />
              );
            })
          )}
          <div ref={fimRef} />
        </div>
      </div>

      <div className="border-t border-borda bg-fundo">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-6 py-4">
          <Seletores
            skills={skills}
            modelos={modelos}
            skillId={skillId}
            modeloId={modeloId}
            buscaWeb={buscaWeb}
            aoTrocarSkill={setSkillId}
            aoTrocarModelo={setModeloId}
            aoAlternarBuscaWeb={setBuscaWeb}
            desabilitado={gerando}
          />

          {erroGlobal && (
            <p role="alert" className="text-sm text-alerta">
              {erroGlobal}
            </p>
          )}

          {semModelos ? (
            <p className="rounded-xl border border-borda bg-superficie px-4 py-4 text-sm text-texto-suave">
              Nenhum modelo ativo. O administrador precisa habilitar ao menos um modelo antes
              de iniciar uma conversa.
            </p>
          ) : (
            <div className="flex items-end gap-3">
              <textarea
                ref={campoRef}
                rows={1}
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={aoTeclar}
                placeholder="Pergunte, peça uma análise ou cole uma transcrição…"
                className="campo max-h-[260px] resize-none leading-relaxed"
              />

              {gerando ? (
                <button
                  type="button"
                  onClick={() => abortadorRef.current?.abort()}
                  className="botao botao-secundario shrink-0"
                >
                  Parar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enviarDoCampo}
                  disabled={!entrada.trim()}
                  className="botao botao-primario shrink-0"
                >
                  Enviar
                </button>
              )}
            </div>
          )}

          <p className="text-sm text-texto-tenue">Enter envia · Shift+Enter quebra linha</p>
        </div>
      </div>
    </div>
  );
}
