-- ═══════════════════════════════════════════════════════════════════════════════
-- Areesa _cerebro — base de conhecimento e busca híbrida (Fase 2)
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

create type tipo_documento        as enum ('arquivo', 'texto', 'link');
create type vigencia_documento    as enum ('vigente', 'rascunho', 'obsoleto');
create type status_processamento  as enum ('pendente', 'processando', 'indexado', 'erro');

-- ─── Documentos ────────────────────────────────────────────────────────────────

create table documentos (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  tipo             tipo_documento not null,
  descricao        text,
  fonte_url        text,
  storage_path     text,
  mime             text,
  tamanho_bytes    bigint,
  conteudo_bruto   text,
  sigilo           nivel_sigilo not null default 'interno',
  vigencia         vigencia_documento not null default 'vigente',
  data_referencia  date,
  tags             text[] not null default '{}',
  status           status_processamento not null default 'pendente',
  erro_msg         text,
  total_fragmentos int not null default 0,
  criado_por       uuid references perfis(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  indexado_em      timestamptz
);

-- ─── Fragmentos ────────────────────────────────────────────────────────────────
-- text-embedding-3-small produz 1536 dimensões. A coluna tsv é gerada pelo
-- próprio banco, então nunca sai de sincronia com o conteúdo.

create table fragmentos (
  id           bigserial primary key,
  documento_id uuid not null references documentos(id) on delete cascade,
  ordem        int not null,
  conteudo     text not null,
  tokens       int not null default 0,
  embedding    vector(1536),
  tsv          tsvector generated always as (to_tsvector('portuguese', conteudo)) stored
);

create index idx_fragmentos_documento on fragmentos (documento_id, ordem);
create index idx_fragmentos_tsv       on fragmentos using gin (tsv);
create index idx_fragmentos_embedding on fragmentos using hnsw (embedding vector_cosine_ops);

create index idx_documentos_status  on documentos (status) where status in ('pendente', 'erro');
create index idx_documentos_sigilo  on documentos (sigilo, vigencia);
create index idx_documentos_tags    on documentos using gin (tags);

create trigger t_documentos_atualizado
  before update on documentos
  for each row execute function public.tocar_atualizado_em();

-- ─── Busca híbrida ─────────────────────────────────────────────────────────────
-- Reciprocal Rank Fusion entre busca vetorial (perguntas conceituais) e
-- full-text em português (nome de cliente, código de projeto, sigla).
--
-- `sigilo_max` é o teto do MODELO da conversa, não do usuário: o RLS da tabela
-- já limita o que a pessoa pode ver, e este parâmetro impede que trechos
-- confidenciais sejam enviados a um modelo gratuito.

create or replace function public.buscar_conhecimento(
  consulta_embedding vector(1536),
  consulta_texto     text,
  sigilo_max         nivel_sigilo,
  limite             int default 8
)
returns table (
  documento_id    uuid,
  titulo          text,
  fragmento_id    bigint,
  conteudo        text,
  sigilo          nivel_sigilo,
  vigencia        vigencia_documento,
  data_referencia date,
  fonte_url       text,
  pontuacao       real
)
language sql
stable
set search_path = public
as $$
  with permitidos as (
    select f.id, f.documento_id, f.conteudo, f.embedding, f.tsv,
           d.titulo, d.sigilo, d.vigencia, d.data_referencia, d.fonte_url
      from fragmentos f
      join documentos d on d.id = f.documento_id
     where d.status = 'indexado'
       and d.vigencia <> 'obsoleto'
       and public.peso_sigilo(d.sigilo) <= public.peso_sigilo(sigilo_max)
  ),
  vetorial as (
    select id, row_number() over (order by embedding <=> consulta_embedding) as posicao
      from permitidos
     where embedding is not null
     order by embedding <=> consulta_embedding
     limit 30
  ),
  textual as (
    select id,
           row_number() over (
             order by ts_rank_cd(tsv, plainto_tsquery('portuguese', consulta_texto)) desc
           ) as posicao
      from permitidos
     where coalesce(consulta_texto, '') <> ''
       and tsv @@ plainto_tsquery('portuguese', consulta_texto)
     limit 30
  ),
  fusao as (
    -- k = 60 é a constante usual do RRF: amortece o peso das primeiras posições
    -- para que um resultado forte em só um dos dois rankings ainda apareça.
    select coalesce(v.id, t.id) as id,
           coalesce(1.0 / (60 + v.posicao), 0) + coalesce(1.0 / (60 + t.posicao), 0) as pontuacao
      from vetorial v
      full outer join textual t on t.id = v.id
  )
  select p.documento_id, p.titulo, p.id, p.conteudo, p.sigilo, p.vigencia,
         p.data_referencia, p.fonte_url, fusao.pontuacao::real
    from fusao
    join permitidos p on p.id = fusao.id
   order by fusao.pontuacao desc
   limit limite;
$$;

-- ─── Row Level Security ────────────────────────────────────────────────────────

alter table documentos enable row level security;
alter table fragmentos enable row level security;

-- Leitura filtrada pelo nível de sigilo do usuário; escrita só do master.
create policy documentos_leitura on documentos for select
  using (
    public.usuario_ativo()
    and public.peso_sigilo(sigilo) <= public.peso_sigilo(public.sigilo_do_usuario())
  );

create policy documentos_escrita on documentos for all
  using (public.eh_master()) with check (public.eh_master());

create policy fragmentos_leitura on fragmentos for select
  using (exists (
    select 1 from documentos d
     where d.id = documento_id
       and public.usuario_ativo()
       and public.peso_sigilo(d.sigilo) <= public.peso_sigilo(public.sigilo_do_usuario())
  ));

create policy fragmentos_escrita on fragmentos for all
  using (public.eh_master()) with check (public.eh_master());

-- ─── Storage ───────────────────────────────────────────────────────────────────
-- Bucket privado: o arquivo original só sai por URL assinada gerada no servidor.

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy documentos_storage_leitura on storage.objects for select
  using (bucket_id = 'documentos' and public.usuario_ativo());

create policy documentos_storage_escrita on storage.objects for all
  using (bucket_id = 'documentos' and public.eh_master())
  with check (bucket_id = 'documentos' and public.eh_master());
