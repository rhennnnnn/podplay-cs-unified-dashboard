-- Postgres's to_tsvector() hard-fails ("string is too long for tsvector") on
-- input over ~1MB. Embedded base64 images inflate content well past that
-- and are meaningless for full-text search anyway — strip them out of the
-- text fed into search_vector instead of indexing them.
-- Run manually in the Supabase SQL editor (no DDL-execution tool in this environment).

drop index if exists ops_articles_fts;
alter table ops_articles drop column if exists search_vector;
alter table ops_articles add column search_vector tsvector generated always as (
  setweight(to_tsvector('english', title), 'A') ||
  setweight(
    to_tsvector(
      'english',
      regexp_replace(content, 'data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+', '', 'g')
    ),
    'B'
  )
) stored;
create index ops_articles_fts on ops_articles using gin(search_vector);
