'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ROTULO_PAPEL,
  ROTULO_SIGILO,
  type NivelSigilo,
  type PapelUsuario,
  type Perfil,
} from '@/lib/tipos';

interface Convite {
  email: string;
  nome: string | null;
  papel: string;
  criado_em: string;
  usado_em: string | null;
}

interface Props {
  perfis: Perfil[];
  convitesPendentes: Convite[];
  gastos: Record<string, number>;
}

export function PainelUsuarios({ perfis, convitesPendentes, gastos }: Props) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<PapelUsuario>('colaborador');
  const [sigilo, setSigilo] = useState<NivelSigilo>('interno');
  const [limite, setLimite] = useState('25');

  async function convidar(evento: React.FormEvent) {
    evento.preventDefault();
    setAviso(null);
    setOcupado(true);

    const resposta = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        nome,
        papel,
        sigiloMaximo: sigilo,
        limiteMensalUsd: Number(limite),
      }),
    });

    const corpo = await resposta.json();
    setOcupado(false);

    if (!resposta.ok) {
      setAviso({ tipo: 'erro', texto: corpo.erro ?? 'Falha ao convidar.' });
      return;
    }

    setAviso({
      tipo: 'ok',
      texto: `Convite criado para ${corpo.email}. Peça para a pessoa entrar em /login com esse e-mail.`,
    });
    setEmail('');
    setNome('');
    router.refresh();
  }

  async function alterar(id: string, alteracoes: Record<string, unknown>) {
    const resposta = await fetch(`/api/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alteracoes),
    });

    if (!resposta.ok) {
      const corpo = await resposta.json();
      setAviso({ tipo: 'erro', texto: corpo.erro ?? 'Falha ao alterar.' });
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-texto-suave">
          O acesso é por convite. Sem convite, quem tentar entrar fica com o perfil inativo.
        </p>
      </header>

      {/* ─── Convite ─── */}
      <section className="rounded-xl border border-borda bg-superficie p-4">
        <h2 className="mb-3 text-sm font-medium">Convidar colaborador</h2>

        <form onSubmit={convidar} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="conv-email">
                E-mail
              </label>
              <input
                id="conv-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@areesa.com.br"
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="conv-nome">
                Nome
              </label>
              <input
                id="conv-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="conv-papel">
                Papel
              </label>
              <select
                id="conv-papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as PapelUsuario)}
                className="w-full rounded-lg border border-borda bg-fundo px-2 py-2 text-sm"
              >
                {(Object.keys(ROTULO_PAPEL) as PapelUsuario[]).map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_PAPEL[p]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="conv-sigilo">
                Acesso a documentos
              </label>
              <select
                id="conv-sigilo"
                value={sigilo}
                onChange={(e) => setSigilo(e.target.value as NivelSigilo)}
                className="w-full rounded-lg border border-borda bg-fundo px-2 py-2 text-sm"
              >
                {(Object.keys(ROTULO_SIGILO) as NivelSigilo[]).map((s) => (
                  <option key={s} value={s}>
                    Até {ROTULO_SIGILO[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-texto-suave" htmlFor="conv-limite">
                Teto mensal (US$, 0 = sem limite)
              </label>
              <input
                id="conv-limite"
                type="number"
                min="0"
                step="5"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              />
            </div>
          </div>

          {aviso && (
            <p className={`text-xs ${aviso.tipo === 'erro' ? 'text-alerta' : 'text-texto-suave'}`}>
              {aviso.texto}
            </p>
          )}

          <button
            type="submit"
            disabled={ocupado}
            className="rounded-lg bg-inverso-fundo px-4 py-2 text-sm font-medium text-inverso-texto
                       transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {ocupado ? 'Criando…' : 'Criar convite'}
          </button>
        </form>
      </section>

      {/* ─── Convites pendentes ─── */}
      {convitesPendentes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Convites aguardando primeiro acesso</h2>
          <ul className="space-y-1.5">
            {convitesPendentes.map((convite) => (
              <li
                key={convite.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border
                           border-borda bg-superficie px-3.5 py-2.5 text-sm"
              >
                <span>
                  {convite.nome ? `${convite.nome} · ` : ''}
                  {convite.email}
                </span>
                <span className="text-[11px] text-texto-tenue">
                  {ROTULO_PAPEL[convite.papel as PapelUsuario]} · convidado em{' '}
                  {new Date(convite.criado_em).toLocaleDateString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Usuários ─── */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Com acesso</h2>

        <ul className="space-y-2">
          {perfis.map((perfil) => {
            const gasto = gastos[perfil.id] ?? 0;
            const teto = Number(perfil.limite_mensal_usd);
            const estourou = teto > 0 && gasto >= teto;

            return (
              <li key={perfil.id} className="rounded-xl border border-borda bg-superficie p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {perfil.nome ?? perfil.email}
                      {!perfil.ativo && (
                        <span className="ml-2 text-[11px] font-normal text-atencao">inativo</span>
                      )}
                    </p>
                    <p className="text-[11px] text-texto-tenue">{perfil.email}</p>
                    <p className={`mt-0.5 text-[11px] ${estourou ? 'text-alerta' : 'text-texto-tenue'}`}>
                      Consumo do mês: US$ {gasto.toFixed(2)}
                      {teto > 0 ? ` de ${teto.toFixed(2)}` : ' · sem teto'}
                      {estourou && ' — bloqueado até o mês virar ou o teto subir'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={perfil.papel}
                      onChange={(e) => alterar(perfil.id, { papel: e.target.value })}
                      aria-label={`Papel de ${perfil.email}`}
                      className="rounded border border-borda bg-fundo px-1.5 py-1 text-[11px]"
                    >
                      {(Object.keys(ROTULO_PAPEL) as PapelUsuario[]).map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_PAPEL[p]}
                        </option>
                      ))}
                    </select>

                    <select
                      value={perfil.sigilo_maximo}
                      onChange={(e) => alterar(perfil.id, { sigiloMaximo: e.target.value })}
                      aria-label={`Acesso a documentos de ${perfil.email}`}
                      className="rounded border border-borda bg-fundo px-1.5 py-1 text-[11px]"
                    >
                      {(Object.keys(ROTULO_SIGILO) as NivelSigilo[]).map((s) => (
                        <option key={s} value={s}>
                          Até {ROTULO_SIGILO[s]}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="0"
                      step="5"
                      defaultValue={teto}
                      onBlur={(e) => {
                        const valor = Number(e.target.value);
                        if (valor !== teto) alterar(perfil.id, { limiteMensalUsd: valor });
                      }}
                      aria-label={`Teto mensal de ${perfil.email}`}
                      className="w-20 rounded border border-borda bg-fundo px-1.5 py-1 text-[11px]"
                    />

                    <button
                      type="button"
                      onClick={() => alterar(perfil.id, { ativo: !perfil.ativo })}
                      className="rounded border border-borda px-2 py-1 text-[11px] hover:bg-superficie-alta"
                    >
                      {perfil.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
