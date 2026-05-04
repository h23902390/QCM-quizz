-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.decks enable row level security;

drop policy if exists "decks_owner_select" on public.decks;
drop policy if exists "decks_owner_insert" on public.decks;
drop policy if exists "decks_owner_update" on public.decks;
drop policy if exists "decks_owner_delete" on public.decks;

create policy "decks_owner_select" on public.decks
  for select using (auth.uid() = user_id);
create policy "decks_owner_insert" on public.decks
  for insert with check (auth.uid() = user_id);
create policy "decks_owner_update" on public.decks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "decks_owner_delete" on public.decks
  for delete using (auth.uid() = user_id);

create index if not exists decks_user_created_idx
  on public.decks (user_id, created_at desc);
