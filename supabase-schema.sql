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

-- ---------- ECOS cases (synchro multi-appareils) ----------
create table if not exists public.ecos_cases (
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  case_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, case_id)
);

alter table public.ecos_cases enable row level security;

drop policy if exists "ecos_cases_owner_select" on public.ecos_cases;
drop policy if exists "ecos_cases_owner_insert" on public.ecos_cases;
drop policy if exists "ecos_cases_owner_update" on public.ecos_cases;
drop policy if exists "ecos_cases_owner_delete" on public.ecos_cases;

create policy "ecos_cases_owner_select" on public.ecos_cases
  for select using (auth.uid() = user_id);
create policy "ecos_cases_owner_insert" on public.ecos_cases
  for insert with check (auth.uid() = user_id);
create policy "ecos_cases_owner_update" on public.ecos_cases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ecos_cases_owner_delete" on public.ecos_cases
  for delete using (auth.uid() = user_id);
