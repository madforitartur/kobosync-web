create extension if not exists pg_trgm;

create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  title text not null,
  author text,
  series text,
  series_index numeric,
  language text,
  publisher text,
  isbn text,
  description text,
  cover_url text,
  epub_url text,
  filesize bigint,
  modified_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.reading_progress (
  user_id uuid not null,
  book_id uuid not null references public.books(id) on delete cascade,
  percentage numeric not null default 0,
  current_location text,
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, book_id)
);

create index if not exists books_title_trgm_idx on public.books using gin (title gin_trgm_ops);
create index if not exists books_author_trgm_idx on public.books using gin (author gin_trgm_ops);
create index if not exists books_series_trgm_idx on public.books using gin (series gin_trgm_ops);

insert into storage.buckets (id, name, public)
values
  ('covers', 'covers', true),
  ('thumbnails', 'thumbnails', true),
  ('epubs', 'epubs', true)
on conflict (id) do update set public = excluded.public;
