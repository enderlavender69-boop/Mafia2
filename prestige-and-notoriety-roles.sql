-- Mafia2 persistence additions — prestige + notoriety roles
-- Run once in Supabase's SQL Editor. Safe to re-run.

-- Prestige / Ascension. One row per user who has ever ascended.
create table if not exists public.prestige (
  user_id          text primary key,
  points           numeric not null default 0,
  ascension_count  integer not null default 0,
  updated_at       timestamptz not null default now()
);
alter table public.prestige enable row level security;
-- No public policies: the bot uses the Supabase service_role key.

-- Notoriety tier -> Discord role mapping, per guild. One row per
-- (guild, tier) pair, e.g. ('123456789', 'feared', '987654321').
create table if not exists public.notoriety_roles (
  guild_id  text not null,
  tier_key  text not null,
  role_id   text not null,
  primary key (guild_id, tier_key)
);
alter table public.notoriety_roles enable row level security;
-- No public policies: the bot uses the Supabase service_role key.
