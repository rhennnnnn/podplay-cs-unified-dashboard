-- OPS Guide v2: managed categories, per-user checklist/favorites/views,
-- image storage, weighted full-text search.
-- Run manually in the Supabase SQL editor (no DDL-execution tool in this environment).

-- Categories (admin-managed; ops_articles.category stays a denormalized text
-- column kept in sync by the API layer on rename, so existing filter/search
-- queries against ops_articles.category need no changes).
create table if not exists ops_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  display_order int not null default 0,
  created_at    timestamptz default now()
);

alter table ops_categories enable row level security;

create policy "team read" on ops_categories
  for select using (auth.role() = 'authenticated');

create policy "admin write" on ops_categories
  for all using (public.is_admin_user())
  with check (public.is_admin_user());

insert into ops_categories (name, display_order) values
  ('Camera Coefficients', 1),
  ('Credit Card Terminal Setup', 2),
  ('IT Troubleshooting Manual', 3),
  ('Tech Support', 4)
on conflict (name) do nothing;

-- Per-user checklist state — never shared across users.
create table if not exists ops_article_checklist_state (
  user_id        uuid not null references auth.users(id) on delete cascade,
  article_id     uuid not null references ops_articles(id) on delete cascade,
  checked_indexes int[] not null default '{}',
  updated_at     timestamptz default now(),
  primary key (user_id, article_id)
);

alter table ops_article_checklist_state enable row level security;

create policy "own rows only" on ops_article_checklist_state
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Favorites — per-user.
create table if not exists ops_article_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references ops_articles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, article_id)
);

alter table ops_article_favorites enable row level security;

create policy "own rows only" on ops_article_favorites
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- View log — powers per-user "Recent" and the org-wide "most viewed" stat.
-- Select is open to any authenticated user (aggregate stats need to read
-- everyone's rows); insert is restricted to the caller's own user_id.
create table if not exists ops_article_views (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references ops_articles(id) on delete cascade,
  viewed_at  timestamptz default now()
);

alter table ops_article_views enable row level security;

create policy "authenticated read all" on ops_article_views
  for select using (auth.role() = 'authenticated');

create policy "insert own rows only" on ops_article_views
  for insert with check (auth.uid() = user_id);

create index if not exists ops_article_views_article_idx on ops_article_views (article_id, viewed_at desc);
create index if not exists ops_article_views_user_idx on ops_article_views (user_id, viewed_at desc);

-- Image storage bucket for article content.
insert into storage.buckets (id, name, public)
values ('ops-guide-images', 'ops-guide-images', true)
on conflict (id) do nothing;

create policy "public read ops guide images" on storage.objects
  for select using (bucket_id = 'ops-guide-images');

create policy "admin write ops guide images" on storage.objects
  for insert with check (bucket_id = 'ops-guide-images' and public.is_admin_user());

create policy "admin delete ops guide images" on storage.objects
  for delete using (bucket_id = 'ops-guide-images' and public.is_admin_user());

-- Weighted full-text search — title matches now outrank body matches.
drop index if exists ops_articles_fts;
alter table ops_articles drop column if exists search_vector;
alter table ops_articles add column search_vector tsvector generated always as (
  setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', content), 'B')
) stored;
create index ops_articles_fts on ops_articles using gin(search_vector);
