-- ═══════════════════════════════════════════════════════════════════════════════
-- Areesa _cerebro — cadeia de fallback entre modelos do OpenRouter
-- ═══════════════════════════════════════════════════════════════════════════════

-- O OpenRouter aceita uma lista ordenada de modelos por requisição: se o
-- primeiro estiver fora do ar, sem cota ou recusar, ele tenta o seguinte dentro
-- da mesma chamada.
alter table modelos
  add column cadeia_de_modelos text[] not null default '{}';

comment on column modelos.cadeia_de_modelos is
  'Slugs tentados em ordem, do preferido ao último recurso. Vazio = usa apenas '
  'model_id. Só se aplica ao OpenRouter.';

-- ─── Roteador automático ───────────────────────────────────────────────────────
-- Entra ao lado do roteador gratuito, sem substituí-lo: tenta primeiro um modelo
-- gratuito e passa ao roteador pago quando não houver disponibilidade.
--
-- Não recebe documentos confidenciais: quando a chamada é atendida pela via
-- gratuita, o provedor pode usar o conteúdo para treinamento.
--
-- Custo fica zerado na tabela de propósito. O preço depende do modelo que o
-- roteador escolher, e o valor real chega no campo `usage.cost` da resposta —
-- é ele que a aplicação grava.

insert into modelos
  (provedor, model_id, nome_exibicao, descricao, gratuito, contexto, max_saida,
   custo_entrada_usd, custo_saida_usd, permite_confidencial, suporta_tools,
   cadeia_de_modelos, ativo, ordem)
values (
  'openrouter',
  'openrouter/auto',
  'OpenRouter — Automático',
  'Usa um modelo gratuito quando há disponibilidade e passa para um pago quando não há. Sem acesso a documentos confidenciais.',
  false, 200000, 8192, 0, 0, false, true,
  array['openrouter/free', 'openrouter/auto'],
  true, 55
)
on conflict (provedor, model_id) do update set
  nome_exibicao     = excluded.nome_exibicao,
  descricao         = excluded.descricao,
  cadeia_de_modelos = excluded.cadeia_de_modelos,
  ativo             = excluded.ativo,
  ordem             = excluded.ordem;

-- ─── Modelo padrão de conversa nova ────────────────────────────────────────────
-- Passa a ser o roteador automático: o custo por conversa cai bastante e, quando
-- a tarefa exigir mais, a pessoa troca para o Opus 5 no seletor.

update configuracoes
   set valor = to_jsonb('openrouter/auto'::text)
 where chave = 'modelo_padrao_slug';
