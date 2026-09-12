-- Mafia2 persistence additions — prestige tech tree + notoriety roles
-- Run once in Supabase's SQL Editor. Safe to re-run.
-- (Supersedes the earlier version of this file if you already ran that one —
-- this adds the `lifetime_points` column and the `prestige_upgrades` table
-- needed for the spendable tech tree. Re-running `create table if not
-- exists` on `prestige` is safe; the ALTER below adds the new column only if
-- it's missing.)

-- Prestige / Ascension. One row per user who has ever ascended.
-- `points` = current SPENDABLE Respect balance (goes down as you buy tree
-- upgrades). `lifetime_points` = total Respect ever earned, never decreases
-- — used for the leaderboard so spending your balance doesn't drop your rank.
create table if not exists public.prestige (
  user_id          text primary key,
  points           numeric not null default 0,
  lifetime_points  numeric not null default 0,
  ascension_count  integer not null default 0,
  updated_at       timestamptz not null default now()
);
alter table public.prestige add column if not exists lifetime_points numeric not null default 0;
alter table public.prestige enable row level security;
-- No public policies: the bot uses the Supabase service_role key.

-- Which tech-tree upgrades each player has bought. One row per
-- (user, upgrade) pair, e.g. ('123456789', 'blood_oath').
create table if not exists public.prestige_upgrades (
  user_id      text not null,
  upgrade_key  text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, upgrade_key)
);
alter table public.prestige_upgrades enable row level security;
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
