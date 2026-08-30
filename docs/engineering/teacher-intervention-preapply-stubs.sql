-- Minimal stand-ins for the objects the teacher migrations depend on but do not
-- create. Everything here exists only so 20260830a..e can run against something
-- shaped like production; none of it is part of the repo.

create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- The simulated JWT. Each test sets test.uid and everything downstream —
-- policies, security-definer bodies, guards — reads it exactly as it would read
-- a real auth.uid().
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create type user_role as enum ('user', 'admin', 'super_admin', 'owner');

create or replace function has_role_at_least(p_min user_role) returns boolean
language sql stable as $$ select coalesce(current_setting('test.is_admin', true), 'off') = 'on' $$;

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  exam_type  text,
  role       user_role not null default 'user'
);

create table weakness_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  topic          text,
  subtopic       text,
  weakness_score numeric,
  priority_rank  integer,
  total_signals  integer,
  severity_band  text,
  trend          text,
  last_signal_at timestamptz,
  topic_id       text,
  subtopic_id    text
);

create table weakness_signals (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  source   text,
  topic    text,
  subtopic text
);

-- The canonical vocabulary. Real ids, so the taxonomy foreign keys in
-- 20260830e are exercised rather than merely declared.
create table taxonomy_topics (
  id text primary key, display_name text, taxonomy_version smallint default 1, is_active boolean default true
);
create table taxonomy_subtopics (
  id text primary key,
  topic_id text not null references taxonomy_topics(id),
  display_name text, taxonomy_version smallint default 1, is_active boolean default true,
  unique (id, topic_id)
);
insert into taxonomy_topics (id, display_name) values
  ('ALGEBRA','Algebra'), ('GEOMETRY','Geometry');
insert into taxonomy_subtopics (id, topic_id, display_name) values
  ('ALG_006','ALGEBRA','Linear Equations & Functions'),
  ('ALG_007','ALGEBRA','Systems of Equations'),
  ('GEO_006','GEOMETRY','Circle & Equation of the Circle');

grant usage on schema public, auth to anon, authenticated, service_role;
