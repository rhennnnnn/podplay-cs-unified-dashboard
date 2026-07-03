-- OPS Troubleshooting Guide (Session 5)
-- Run manually in the Supabase SQL editor (no DDL-execution tool in this environment).

create table if not exists ops_articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,
  content     text not null,   -- HTML from source file
  tags        text[] default '{}',
  created_by  text,            -- email of creator
  updated_by  text,            -- email of last editor
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  published   boolean default true,
  search_vector tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored
);

alter table ops_articles enable row level security;

-- Any authenticated user can read published articles
create policy "team read" on ops_articles
  for select using (auth.role() = 'authenticated' and published = true);

-- Admin-only write (reuses public.is_admin_user() from 004_profiles_rls_fix.sql)
create policy "admin write" on ops_articles
  for all using (public.is_admin_user())
  with check (public.is_admin_user());

-- Full-text search index
create index if not exists ops_articles_fts on ops_articles
  using gin(search_vector);

-- Allow idempotent re-seeding via upsert on title
create unique index if not exists ops_articles_title_key on ops_articles (title);
