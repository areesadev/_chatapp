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

  // Rola para o fim a cada token novo.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: gerando ? 'auto' : 'smooth' });
  }, [mensagens, gerando]);

  // Altura do campo acompanha o conteúdo, até um teto.
  useEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, 200)}px`;
  }, [entrada]);

  useEffect(() => () => abortadorRef.current?.abort(), []);

  const enviar = useCallback(
    async (texto: string) => {
      const conteudo = texto.trim();
      if (!conteudo || gerando || !modeloId) return;

      setErroGlobal(null);
      setEntrada('');
      setGerando(true);

      const idProvisorio = `local-${Date.now()}`;
      const idResposta = `${idProvisorio}-resposta`;

      setMensagens((atuais) => [
        ...atuais,
        { id: idProvisorio, papel: 'user', conteudo },
        { id: idResposta, papel: 'assistant', conteudo: '' },
      ]);

      const abortador = new AbortController();
      abortadorRef.current = abortador;

      const atualizarResposta = (mudanca: Partial<MensagemVisivel>) =>
        setMensagens((atuais) =>
          atuais.map((m) => (m.id === idResposta ? { ...m, ...mudanca } : m)),
        );

      try {
        const resposta = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortador.signal,
          body: JSON.stringify({ mensagem: conteudo, conversaId, skillId, modeloId, buscaWeb }),
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
                break;
              }
              case 'citacoes':
                atualizarResposta({ citacoes: evento.citacoes as Citacao[] });
                break;
              case 'texto':
                acumuladoTexto += evento.texto as string;
                atualizarResposta({ conteudo: acumuladoTexto });
                break;
              case 'raciocinio':
                acumuladoRaciocinio += evento.texto as string;
                atualizarResposta({ raciocinio: acumuladoRaciocinio });
                break;
              case 'erro':
                atualizarResposta({ erro: evento.mensagem as string });
                break;
              case 'fim': {
                // Troca o id local pelo id real para liberar a exportação.
                const idReal = evento.mensagemId as string | null;
                if (idReal) {
                  setMensagens((atuais) =>
                    atuais.map((m) => (m.id === idResposta ? { ...m, id: idReal } : m)),
                  );
                }
                break;
              }
            }
          }
        }
      } catch (erro) {
        if (abortador.signal.aborted) {
          atualizarResposta({ erro: 'Geração interrompida.' });
        } else {
          const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado.';
          setErroGlobal(mensagem);
          setMensagens((atuais) => atuais.filter((m) => m.id !== idResposta));
        }
      } finally {
        setGerando(false);
        abortadorRef.current = null;
        // Atualiza a lista lateral (título e ordem) sem recarregar a página.
        router.refresh();
      }
    },
    [buscaWeb, conversaId, gerando, modeloId, router, skillId],
  );

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
      void enviar(entrada);
    }
  }

  const semModelos = modelos.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {conversaId && (
        <header className="flex items-center justify-end border-b border-borda px-4 py-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-texto-suave">
            <input
              type="checkbox"
              checked={compartilhada}
              onChange={alternarCompartilhamento}
            />
            {compartilhada
              ? 'Compartilhada com o time'
              : 'Compartilhar com o time'}
          </label>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
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
            mensagens.map((mensagem, indice) => (
              <Mensagem
                key={mensagem.id}
                mensagem={mensagem}
                gerando={gerando && indice === mensagens.length - 1 && mensagem.papel === 'assistant'}
              />
            ))
          )}
          <div ref={fimRef} />
        </div>
      </div>

      <div className="border-t border-borda bg-fundo">
        <div className="mx-auto w-full max-w-3xl space-y-2.5 px-4 py-3">
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
            <p role="alert" className="text-xs text-alerta">
              {erroGlobal}
            </p>
          )}

          {semModelos ? (
            <p className="rounded-lg border border-borda bg-superficie px-3 py-2.5 text-xs text-texto-suave">
              Nenhum modelo ativo. O administrador precisa habilitar ao menos um modelo antes
              de iniciar uma conversa.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                ref={campoRef}
                rows={1}
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={aoTeclar}
                placeholder="Pergunte, peça uma análise ou cole uma transcrição…"
                className="max-h-[200px] min-h-[44px] flex-1 resize-none rounded-lg border border-borda
                           bg-fundo px-3 py-2.5 text-sm leading-relaxed placeholder:text-texto-tenue
                           focus:outline-none focus:ring-2 focus:ring-texto"
              />

              {gerando ? (
                <button
                  type="button"
                  onClick={() => abortadorRef.current?.abort()}
                  className="h-[44px] shrink-0 rounded-lg border border-borda px-4 text-sm hover:bg-superficie"
                >
                  Parar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void enviar(entrada)}
                  disabled={!entrada.trim()}
                  className="h-[44px] shrink-0 rounded-lg bg-inverso-fundo px-4 text-sm font-medium
                             text-inverso-texto transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Enviar
                </button>
              )}
            </div>
          )}

          <p className="text-[11px] text-texto-tenue">
            Enter envia · Shift+Enter quebra linha
          </p>
        </div>
      </div>
    </div>
  );
}
