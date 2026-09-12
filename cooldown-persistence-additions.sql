-- Mafia2 persistence additions — cooldowns
-- Run once in Supabase's SQL Editor. Safe to re-run.

-- Work / Crime / Scavenge / Smuggle cooldowns (jobs.js). One row per user,
-- a single jsonb blob of { work: ts, crime: ts, scavenge: ts, smuggle: ts }.
create table if not exists public.job_cooldowns (
  user_id     text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.job_cooldowns enable row level security;
-- No public policies: the bot uses the Supabase service_role key.

-- Gamble / Rob / Chess cooldowns (index.js, guild-scoped). One row per
-- user+guild pair, a single jsonb blob of { gamble: ts, rob: ts, chess: ts }.
create table if not exists public.guild_cooldowns (
  user_id     text not null,
  guild_id    text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, guild_id)
);
alter table public.guild_cooldowns enable row level security;
-- No public policies: the bot uses the Supabase service_role key.
