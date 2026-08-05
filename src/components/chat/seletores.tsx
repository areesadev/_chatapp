'use client';

import type { Modelo, Skill } from '@/lib/tipos';

interface Props {
  skills: Skill[];
  modelos: Modelo[];
  skillId: string | null;
  modeloId: string | null;
  buscaWeb: boolean;
  aoTrocarSkill: (id: string | null) => void;
  aoTrocarModelo: (id: string) => void;
  aoAlternarBuscaWeb: (ativa: boolean) => void;
  desabilitado?: boolean;
}

export function Seletores({
  skills,
  modelos,
  skillId,
  modeloId,
  buscaWeb,
  aoTrocarSkill,
  aoTrocarModelo,
  aoAlternarBuscaWeb,
  desabilitado,
}: Props) {
  const skill = skills.find((s) => s.id === skillId) ?? null;
  const modelo = modelos.find((m) => m.id === modeloId) ?? null;

  const pagos = modelos.filter((m) => !m.gratuito);
  const gratuitos = modelos.filter((m) => m.gratuito);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="seletor-skill">
          Papel do agente nesta conversa
        </label>
        <select
          id="seletor-skill"
          value={skillId ?? ''}
          onChange={(e) => aoTrocarSkill(e.target.value || null)}
          disabled={desabilitado}
          className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-xs
                     disabled:opacity-50 sm:flex-none"
        >
          <option value="">Sem papel definido</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="seletor-modelo">
          Modelo de IA
        </label>
        <select
          id="seletor-modelo"
          value={modeloId ?? ''}
          onChange={(e) => aoTrocarModelo(e.target.value)}
          disabled={desabilitado}
          className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-xs
                     disabled:opacity-50 sm:flex-none"
        >
          {pagos.length > 0 && (
            <optgroup label="Pagos">
              {pagos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome_exibicao}
                </option>
              ))}
            </optgroup>
          )}
          {gratuitos.length > 0 && (
            <optgroup label="Gratuitos">
              {gratuitos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome_exibicao}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-borda
                     px-2.5 py-1.5 text-xs text-texto-suave hover:bg-superficie"
        >
          <input
            type="checkbox"
            checked={buscaWeb}
            onChange={(e) => aoAlternarBuscaWeb(e.target.checked)}
            disabled={desabilitado}
          />
          Buscar na web
        </label>
      </div>

      {skill && <p className="text-[11px] leading-snug text-texto-tenue">{skill.descricao}</p>}

      {buscaWeb && (
        <p className="text-[11px] leading-snug text-texto-tenue">
          A busca na web é cobrada à parte pelo provedor — inclusive em modelo gratuito.
        </p>
      )}

      {modelo?.gratuito && (
        <p className="text-[11px] leading-snug text-atencao">
          Modelo gratuito: o provedor pode usar esta conversa para treinamento, e documentos
          confidenciais da base não são enviados a ele.
        </p>
      )}
    </div>
  );
}
