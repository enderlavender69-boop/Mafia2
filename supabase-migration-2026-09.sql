-- Mafia2 persistence additions — 2026-09
create table if not exists public.shop_daily_purchases (user_id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.shop_daily_purchases enable row level security;
-- No public policies: the bot uses the Supabase service_role key.
