'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Modelo, Skill } from '@/lib/tipos';

interface Props {
  skills: Skill[];
  modelos: Modelo[];
  persona: string;
}

export function PainelConfig({ skills, modelos, persona }: Props) {
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-texto-suave">
          Persona, papéis do agente e quais modelos aparecem no seletor das conversas.
        </p>
      </header>

      <SecaoPersona persona={persona} />
      <SecaoSkills skills={skills} />
      <SecaoModelos modelos={modelos} />
    </div>
  );
}

/* ─── Persona ─────────────────────────────────────────────────────────────── */

function SecaoPersona({ persona }: { persona: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState(persona);
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'salvo'>('parado');

  async function salvar() {
    setEstado('salvando');
    const resposta = await fetch('/api/configuracoes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'persona_base', valor: texto }),
    });
    setEstado(resposta.ok ? 'salvo' : 'parado');
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-medium">Persona</h2>
        <p className="text-sm text-texto-suave">
          Entra em toda conversa, antes das instruções da skill escolhida. Vale para todos os
          modelos.
        </p>
      </div>

      <textarea
        rows={14}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEstado('parado');
        }}
        className="campo resize-y font-mono text-sm leading-relaxed"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={estado === 'salvando' || texto === persona}
          className="botao botao-primario"
        >
          {estado === 'salvando' ? 'Salvando…' : 'Salvar persona'}
        </button>
        {estado === 'salvo' && <span className="text-sm text-texto-suave">Salvo.</span>}
      </div>
    </section>
  );
}

/* ─── Skills ──────────────────────────────────────────────────────────────── */

function SecaoSkills({ skills }: { skills: Skill[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(id: string, dados: Partial<Skill>) {
    const resposta = await fetch(`/api/skills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    if (!resposta.ok) setErro((await resposta.json()).erro);
    setEditando(null);
    router.refresh();
  }

  async function criar(dados: { nome: string; descricao: string; instrucoes: string }) {
    const resposta = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
    if (!resposta.ok) {
      setErro((await resposta.json()).erro);
      return;
    }
    setCriando(false);
    setErro(null);
    router.refresh();
  }

  async function apagar(skill: Skill) {
    if (
      !confirm(
        `Apagar a skill "${skill.nome}"? As conversas que a usavam continuam existindo, ` +
          'apenas ficam sem papel definido.',
      )
    )
      return;

    await fetch(`/api/skills/${skill.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Skills</h2>
          <p className="text-sm text-texto-suave">
            O papel que o agente assume na conversa. As instruções entram no system prompt
            logo após a persona.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando((v) => !v)}
          className="botao botao-secundario shrink-0"
        >
          {criando ? 'Cancelar' : 'Nova skill'}
        </button>
      </div>

      {erro && <p className="text-sm text-alerta">{erro}</p>}

      {criando && <FormularioSkill aoSalvar={criar} aoCancelar={() => setCriando(false)} />}

      <ul className="space-y-2">
        {skills.map((skill) => (
          <li key={skill.id} className="rounded-2xl border border-borda bg-superficie p-5">
            {editando === skill.id ? (
              <FormularioSkill
                inicial={skill}
                aoSalvar={(dados) => salvar(skill.id, dados)}
                aoCancelar={() => setEditando(null)}
              />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {skill.nome}
                    {!skill.ativa && (
                      <span className="ml-2 text-sm font-normal text-atencao">oculta</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-texto-suave">{skill.descricao}</p>
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditando(skill.id)}
                    className="botao-mini"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => salvar(skill.id, { ativa: !skill.ativa })}
                    className="botao-mini"
                  >
                    {skill.ativa ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => apagar(skill)}
                    className="botao-mini text-alerta"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FormularioSkill({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial?: Skill;
  aoSalvar: (dados: { nome: string; descricao: string; instrucoes: string }) => void;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [instrucoes, setInstrucoes] = useState(inicial?.instrucoes ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar({ nome, descricao, instrucoes });
      }}
      className="space-y-2.5"
    >
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome — ex.: Auditor de Escopo e Viabilidade"
        required
        className="campo"
      />
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Descrição em uma linha — aparece abaixo do seletor"
        required
        className="campo"
      />
      <textarea
        rows={8}
        value={instrucoes}
        onChange={(e) => setInstrucoes(e.target.value)}
        placeholder="Instruções: o que o agente prioriza neste papel, o que ele nunca deve fazer, o formato de saída esperado."
        required
        className="campo resize-y font-mono text-sm leading-relaxed"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="botao botao-primario"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={aoCancelar}
          className="botao botao-secundario"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* ─── Modelos ─────────────────────────────────────────────────────────────── */

function SecaoModelos({ modelos }: { modelos: Modelo[] }) {
  const router = useRouter();
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  async function alterar(id: string, dados: Record<string, unknown>) {
    const resposta = await fetch(`/api/modelos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });

    if (!resposta.ok) {
      const corpo = await resposta.json();

      // Liberar confidencial em modelo gratuito exige confirmação explícita.
      if (corpo.exigeConfirmacao && confirm(`${corpo.erro}\n\nConfirmar mesmo assim?`)) {
        await fetch(`/api/modelos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...dados, confirmarGratuito: true }),
        });
      } else {
        setAviso(corpo.erro);
      }
    }
    router.refresh();
  }

  async function sincronizar() {
    setSincronizando(true);
    setAviso(null);

    const resposta = await fetch('/api/modelos/sincronizar', { method: 'POST' });
    const corpo = await resposta.json();

    setAviso(
      resposta.ok
        ? `${corpo.total} modelos importados do OpenRouter (${corpo.gratuitos} gratuitos). ` +
            'Entram desativados — ative os que quiser abaixo.'
        : (corpo.erro ?? 'Falha ao sincronizar.'),
    );
    setSincronizando(false);
    router.refresh();
  }

  const filtrados = busca
    ? modelos.filter((m) =>
        `${m.nome_exibicao} ${m.model_id}`.toLowerCase().includes(busca.toLowerCase()),
      )
    : modelos.filter((m) => m.ativo || m.provedor === 'anthropic');

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Modelos</h2>
          <p className="text-sm text-texto-suave">
            Só os modelos ativos aparecem no seletor das conversas.
          </p>
        </div>
        <button
          type="button"
          onClick={sincronizar}
          disabled={sincronizando}
          className="botao botao-secundario shrink-0"
        >
          {sincronizando ? 'Importando…' : 'Importar catálogo OpenRouter'}
        </button>
      </div>

      {aviso && <p className="text-sm text-texto-suave">{aviso}</p>}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar modelo… (sem busca, mostra os ativos e todos os da Anthropic)"
        className="campo"
      />

      <ul className="space-y-1.5">
        {filtrados.map((modelo) => (
          <li
            key={modelo.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border
                       border-borda bg-superficie px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {modelo.nome_exibicao}
                {modelo.gratuito && (
                  <span className="ml-2 text-sm text-atencao">gratuito</span>
                )}
              </p>
              <p className="truncate text-sm text-texto-tenue">
                {modelo.provedor}/{modelo.model_id}
                {!modelo.gratuito &&
                  ` · US$ ${Number(modelo.custo_entrada_usd).toFixed(2)} entrada / ` +
                    `${Number(modelo.custo_saida_usd).toFixed(2)} saída por 1M tokens`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-texto-suave">
                <input
                  type="checkbox"
                  checked={modelo.permite_confidencial}
                  onChange={(e) =>
                    alterar(modelo.id, { permiteConfidencial: e.target.checked })
                  }
                />
                Confidencial
              </label>

              <label className="flex items-center gap-1.5 text-sm text-texto-suave">
                <input
                  type="checkbox"
                  checked={modelo.ativo}
                  onChange={(e) => alterar(modelo.id, { ativo: e.target.checked })}
                />
                Ativo
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
