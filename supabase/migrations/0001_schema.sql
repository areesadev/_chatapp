-- ═══════════════════════════════════════════════════════════════════════════════
-- Areesa _cerebro — schema base (Fase 1)
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Tipos ─────────────────────────────────────────────────────────────────────

create type papel_usuario  as enum ('master', 'socio', 'diretor', 'colaborador');
create type nivel_sigilo   as enum ('publico', 'interno', 'confidencial');
create type provedor_ia    as enum ('anthropic', 'openrouter');
create type papel_mensagem as enum ('user', 'assistant');

-- Ordena os níveis de sigilo para comparação (publico < interno < confidencial).
create function public.peso_sigilo(s nivel_sigilo)
returns int language sql immutable as $$
  select case s when 'publico' then 0 when 'interno' then 1 when 'confidencial' then 2 end;
$$;

-- ─── Perfis ────────────────────────────────────────────────────────────────────
-- Espelha auth.users. Criado pelo trigger ao_criar_usuario (ver abaixo).
-- limite_mensal_usd = 0 significa ilimitado.

create table perfis (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null unique,
  nome              text,
  papel             papel_usuario not null default 'colaborador',
  sigilo_maximo     nivel_sigilo  not null default 'interno',
  limite_mensal_usd numeric(10,2) not null default 25,
  ativo             boolean not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- ─── Funções auxiliares ────────────────────────────────────────────────────────
-- SECURITY DEFINER para não recair nas políticas de RLS da própria tabela perfis
-- (uma policy que consultasse perfis diretamente entraria em recursão infinita).

create function public.eh_master()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis where id = auth.uid() and papel = 'master' and ativo
  );
$$;

create function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

create function public.sigilo_do_usuario()
returns nivel_sigilo language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sigilo_maximo from perfis where id = auth.uid() and ativo),
    'publico'::nivel_sigilo
  );
$$;

-- ─── Convites ──────────────────────────────────────────────────────────────────
-- Único caminho de entrada: sem convite (ou sem ser o master), o perfil nasce
-- inativo e o middleware barra o acesso.

create table convites (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  nome              text,
  papel             papel_usuario not null default 'colaborador',
  sigilo_maximo     nivel_sigilo  not null default 'interno',
  limite_mensal_usd numeric(10,2) not null default 25,
  criado_por        uuid references perfis(id) on delete set null,
  criado_em         timestamptz not null default now(),
  usado_em          timestamptz
);

create function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cv        convites%rowtype;
  eh_master boolean;
begin
  select * into cv
    from convites
   where lower(email) = lower(new.email) and usado_em is null;

  eh_master := lower(new.email) = 'dev@areesa.com.br';

  insert into perfis (id, email, nome, papel, sigilo_maximo, limite_mensal_usd, ativo)
  values (
    new.id,
    lower(new.email),
    coalesce(cv.nome, new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    case when eh_master then 'master'::papel_usuario  else coalesce(cv.papel, 'colaborador'::papel_usuario) end,
    case when eh_master then 'confidencial'::nivel_sigilo else coalesce(cv.sigilo_maximo, 'interno'::nivel_sigilo) end,
    case when eh_master then 0 else coalesce(cv.limite_mensal_usd, 25) end,
    eh_master or cv.id is not null
  );

  if cv.id is not null then
    update convites set usado_em = now() where id = cv.id;
  end if;

  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Impede que um usuário comum eleve o próprio papel, sigilo, teto ou status.
create function public.proteger_campos_de_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_master() then
    new.papel             := old.papel;
    new.sigilo_maximo     := old.sigilo_maximo;
    new.limite_mensal_usd := old.limite_mensal_usd;
    new.ativo             := old.ativo;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger ao_atualizar_perfil
  before update on perfis
  for each row execute function public.proteger_campos_de_perfil();

-- ─── Skills ────────────────────────────────────────────────────────────────────
-- O papel que o agente assume na conversa. As instruções entram no system prompt.

create table skills (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  nome          text not null,
  descricao     text not null,
  instrucoes    text not null,
  ordem         int not null default 0,
  ativa         boolean not null default true,
  criado_por    uuid references perfis(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ─── Modelos ───────────────────────────────────────────────────────────────────
-- Catálogo do que aparece no seletor. Custos em USD por 1 milhão de tokens.
-- permite_confidencial = false bloqueia a injeção de trechos confidenciais da
-- base de conhecimento (Fase 2). Todo modelo gratuito nasce com false.

create table modelos (
  id                   uuid primary key default gen_random_uuid(),
  provedor             provedor_ia not null,
  model_id             text not null,
  nome_exibicao        text not null,
  descricao            text,
  gratuito             boolean not null default false,
  contexto             int,
  max_saida            int not null default 8192,
  custo_entrada_usd    numeric(12,6) not null default 0,
  custo_saida_usd      numeric(12,6) not null default 0,
  permite_confidencial boolean not null default false,
  suporta_tools        boolean not null default true,
  ativo                boolean not null default true,
  ordem                int not null default 100,
  atualizado_em        timestamptz not null default now(),
  unique (provedor, model_id)
);

-- ─── Conversas e mensagens ─────────────────────────────────────────────────────

create table conversas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references perfis(id) on delete cascade,
  titulo        text not null default 'Nova conversa',
  skill_id      uuid references skills(id) on delete set null,
  modelo_id     uuid references modelos(id) on delete set null,
  compartilhada boolean not null default false,
  arquivada     boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table mensagens (
  id             uuid primary key default gen_random_uuid(),
  conversa_id    uuid not null references conversas(id) on delete cascade,
  papel          papel_mensagem not null,
  conteudo       text not null default '',
  raciocinio     text,
  anexos         jsonb not null default '[]'::jsonb,
  citacoes       jsonb not null default '[]'::jsonb,
  modelo_usado   text,
  tokens_entrada int not null default 0,
  tokens_saida   int not null default 0,
  custo_usd      numeric(12,6) not null default 0,
  erro           text,
  criado_em      timestamptz not null default now()
);

-- ─── Auditoria e configurações ─────────────────────────────────────────────────

create table auditoria (
  id          bigserial primary key,
  usuario_id  uuid references perfis(id) on delete set null,
  acao        text not null,
  entidade    text,
  entidade_id text,
  detalhes    jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now()
);

create table configuracoes (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- ─── Índices ───────────────────────────────────────────────────────────────────

create index idx_conversas_usuario   on conversas (usuario_id, atualizado_em desc);
create index idx_conversas_compart   on conversas (compartilhada) where compartilhada;
create index idx_mensagens_conversa  on mensagens (conversa_id, criado_em);
create index idx_mensagens_custo     on mensagens (criado_em) where custo_usd > 0;
create index idx_auditoria_usuario   on auditoria (usuario_id, criado_em desc);
create index idx_convites_email      on convites (lower(email));

-- ─── Consumo mensal ────────────────────────────────────────────────────────────
-- Base do teto de gasto por pessoa. security_invoker faz a view respeitar o RLS
-- de quem consulta, em vez de rodar com os privilégios de quem a criou.

create view consumo_mensal with (security_invoker = true) as
  select c.usuario_id,
         date_trunc('month', m.criado_em) as mes,
         sum(m.custo_usd)::numeric(12,6)  as custo_usd,
         sum(m.tokens_entrada)            as tokens_entrada,
         sum(m.tokens_saida)              as tokens_saida,
         count(*)                         as mensagens
    from mensagens m
    join conversas c on c.id = m.conversa_id
   group by 1, 2;

-- ─── Row Level Security ────────────────────────────────────────────────────────

alter table perfis        enable row level security;
alter table convites      enable row level security;
alter table skills        enable row level security;
alter table modelos       enable row level security;
alter table conversas     enable row level security;
alter table mensagens     enable row level security;
alter table auditoria     enable row level security;
alter table configuracoes enable row level security;

-- perfis: cada um vê o próprio; master vê todos.
create policy perfis_leitura on perfis for select
  using (id = auth.uid() or public.eh_master());
create policy perfis_atualizacao on perfis for update
  using (id = auth.uid() or public.eh_master())
  with check (id = auth.uid() or public.eh_master());
create policy perfis_insercao_master on perfis for insert
  with check (public.eh_master());
create policy perfis_remocao_master on perfis for delete
  using (public.eh_master());

-- convites: só o master.
create policy convites_master on convites for all
  using (public.eh_master()) with check (public.eh_master());

-- skills e modelos: qualquer usuário ativo lê; só o master escreve.
create policy skills_leitura on skills for select using (public.usuario_ativo());
create policy skills_escrita on skills for all
  using (public.eh_master()) with check (public.eh_master());

create policy modelos_leitura on modelos for select using (public.usuario_ativo());
create policy modelos_escrita on modelos for all
  using (public.eh_master()) with check (public.eh_master());

-- conversas: as próprias, mais as que foram explicitamente compartilhadas.
-- Nem o master lê conversa privada dos outros.
create policy conversas_leitura on conversas for select
  using (usuario_id = auth.uid() or (compartilhada and public.usuario_ativo()));
create policy conversas_insercao on conversas for insert
  with check (usuario_id = auth.uid() and public.usuario_ativo());
create policy conversas_atualizacao on conversas for update
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy conversas_remocao on conversas for delete
  using (usuario_id = auth.uid());

-- mensagens: herdam o acesso da conversa.
create policy mensagens_leitura on mensagens for select
  using (exists (
    select 1 from conversas c
     where c.id = conversa_id
       and (c.usuario_id = auth.uid() or (c.compartilhada and public.usuario_ativo()))
  ));
create policy mensagens_insercao on mensagens for insert
  with check (exists (
    select 1 from conversas c where c.id = conversa_id and c.usuario_id = auth.uid()
  ));
create policy mensagens_atualizacao on mensagens for update
  using (exists (
    select 1 from conversas c where c.id = conversa_id and c.usuario_id = auth.uid()
  ));
create policy mensagens_remocao on mensagens for delete
  using (exists (
    select 1 from conversas c where c.id = conversa_id and c.usuario_id = auth.uid()
  ));

-- auditoria: leitura do master. A escrita passa pela chave secreta no servidor.
create policy auditoria_leitura_master on auditoria for select using (public.eh_master());

-- configurações: usuário ativo lê; master escreve.
create policy config_leitura on configuracoes for select using (public.usuario_ativo());
create policy config_escrita on configuracoes for all
  using (public.eh_master()) with check (public.eh_master());

-- ─── atualizado_em automático ──────────────────────────────────────────────────

create function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger t_skills_atualizado    before update on skills    for each row execute function public.tocar_atualizado_em();
create trigger t_modelos_atualizado   before update on modelos   for each row execute function public.tocar_atualizado_em();
create trigger t_conversas_atualizado before update on conversas for each row execute function public.tocar_atualizado_em();
create trigger t_config_atualizado    before update on configuracoes for each row execute function public.tocar_atualizado_em();
