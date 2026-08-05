'use client';

import type { Skill } from '@/lib/tipos';

/** Ponto de partida por skill — evita a tela em branco na primeira conversa. */
const SUGESTOES: Record<string, string> = {
  'arquiteto-processos':
    'Mapeie o processo atual de onboarding de um cliente novo, apontando onde ele trava e o que dá para eliminar.',
  'capacidade-recursos':
    'Com o time atual, quantos projetos simultâneos conseguimos sustentar sem comprometer prazo?',
  'performance-kpis':
    'Quais indicadores a operação deveria acompanhar semanalmente, e o que cada um informa na prática?',
  'facilitador-alinhamentos':
    'Vou colar a transcrição da última reunião de diretoria. Extraia decisões, ações com responsável e pendências em aberto.',
  'auditor-escopo':
    'Vou colar uma proposta comercial. Aponte os riscos de escopo e diga se conseguimos entregar no prazo previsto.',
  'gestor-conhecimento':
    'Como devemos organizar a documentação da agência para que o histórico de cada cliente seja encontrável?',
};

interface Props {
  nome: string;
  skills: Skill[];
  aoEscolher: (skill: Skill, sugestao: string) => void;
}

export function BoasVindas({ nome, skills, aoEscolher }: Props) {
  const primeiroNome = nome.trim().split(' ')[0];

  return (
    <div className="space-y-6 py-8">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          {primeiroNome ? `Olá, ${primeiroNome}.` : 'Olá.'}
        </h1>
        <p className="text-sm text-texto-suave">
          Escolha o papel que eu devo assumir nesta conversa, ou escreva direto no campo
          abaixo.
        </p>
      </div>

      {skills.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {skills.map((skill) => (
            <li key={skill.id}>
              <button
                type="button"
                onClick={() =>
                  aoEscolher(skill, SUGESTOES[skill.slug] ?? `Atue como ${skill.nome}.`)
                }
                className="h-full w-full rounded-xl border border-borda bg-superficie p-3.5 text-left
                           transition-colors hover:bg-superficie-alta"
              >
                <span className="block text-sm font-medium">{skill.nome}</span>
                <span className="mt-1 block text-xs leading-snug text-texto-suave">
                  {skill.descricao}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
