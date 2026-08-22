-- VitaTrack Cloud Sync v1
-- Run in the Supabase SQL editor before enabling cloud accounts.

create table if not exists public.vitatrack_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists vitatrack_user_state_updated_at_idx
  on public.vitatrack_user_state (updated_at desc);

-- The browser never talks directly to this table in VitaTrack v1.
-- Only the server-side API uses SUPABASE_SERVICE_ROLE_KEY.
alter table public.vitatrack_user_state enable row level security;
revoke all on table public.vitatrack_user_state from anon, authenticated;
