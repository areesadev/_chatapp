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
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="rotulo" htmlFor="seletor-skill">
            Papel do agente
          </label>
          <select
            id="seletor-skill"
            value={skillId ?? ''}
            onChange={(e) => aoTrocarSkill(e.target.value || null)}
            disabled={desabilitado}
            className="campo"
          >
            <option value="">Sem papel definido</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="rotulo" htmlFor="seletor-modelo">
            Modelo
          </label>
          <select
            id="seletor-modelo"
            value={modeloId ?? ''}
            onChange={(e) => aoTrocarModelo(e.target.value)}
            disabled={desabilitado}
            className="campo"
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
        </div>

        <div className="flex items-end">
          <label
            className="flex h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-borda
                       px-4 text-sm text-texto-suave transition-colors hover:bg-superficie"
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
      </div>

      {(skill || (modelo && !modelo.permite_confidencial) || buscaWeb) && (
        <div className="space-y-1.5">
          {skill && <p className="text-sm leading-snug text-texto-tenue">{skill.descricao}</p>}

          {/* O aviso segue `permite_confidencial`, e não `gratuito`: o roteador
              automático é cobrado, mas pode ser atendido por um provedor
              gratuito — e aí o conteúdo pode virar treinamento igual. */}
          {modelo && !modelo.permite_confidencial && (
            <p className="text-sm leading-snug text-atencao">
              {modelo.gratuito
                ? 'Modelo gratuito: o provedor pode usar esta conversa para treinamento.'
                : modelo.cadeia_de_modelos.length > 0
                  ? 'Pode ser atendido por um provedor gratuito, que usa a conversa para treinamento.'
                  : 'Este modelo não recebe documentos confidenciais da base.'}{' '}
              Documentos confidenciais não são enviados a ele.
            </p>
          )}

          {buscaWeb && (
            <p className="text-sm leading-snug text-texto-tenue">
              A busca na web é cobrada à parte pelo provedor — inclusive em modelo gratuito.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
