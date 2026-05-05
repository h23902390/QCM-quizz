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

-- ---------- Fiches synthese ----------
create table if not exists public.study_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  source_name text,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.study_sheets enable row level security;

drop policy if exists "study_sheets_owner_select" on public.study_sheets;
drop policy if exists "study_sheets_owner_insert" on public.study_sheets;
drop policy if exists "study_sheets_owner_update" on public.study_sheets;
drop policy if exists "study_sheets_owner_delete" on public.study_sheets;

create policy "study_sheets_owner_select" on public.study_sheets
  for select using (auth.uid() = user_id);
create policy "study_sheets_owner_insert" on public.study_sheets
  for insert with check (auth.uid() = user_id);
create policy "study_sheets_owner_update" on public.study_sheets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "study_sheets_owner_delete" on public.study_sheets
  for delete using (auth.uid() = user_id);

create index if not exists study_sheets_user_created_idx
  on public.study_sheets (user_id, created_at desc);

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

-- ---------- ECOS attempts (historique dernier passage par cas) ----------
create table if not exists public.ecos_attempts (
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  case_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, case_id)
);

alter table public.ecos_attempts enable row level security;

drop policy if exists "ecos_attempts_owner_select" on public.ecos_attempts;
drop policy if exists "ecos_attempts_owner_insert" on public.ecos_attempts;
drop policy if exists "ecos_attempts_owner_update" on public.ecos_attempts;
drop policy if exists "ecos_attempts_owner_delete" on public.ecos_attempts;

create policy "ecos_attempts_owner_select" on public.ecos_attempts
  for select using (auth.uid() = user_id);
create policy "ecos_attempts_owner_insert" on public.ecos_attempts
  for insert with check (auth.uid() = user_id);
create policy "ecos_attempts_owner_update" on public.ecos_attempts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ecos_attempts_owner_delete" on public.ecos_attempts
  for delete using (auth.uid() = user_id);

-- ---------- Analyses partiels sauvegardées ----------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.analyses enable row level security;
drop policy if exists "analyses_owner_select" on public.analyses;
drop policy if exists "analyses_owner_insert" on public.analyses;
drop policy if exists "analyses_owner_update" on public.analyses;
drop policy if exists "analyses_owner_delete" on public.analyses;
create policy "analyses_owner_select" on public.analyses for select using (auth.uid() = user_id);
create policy "analyses_owner_insert" on public.analyses for insert with check (auth.uid() = user_id);
create policy "analyses_owner_update" on public.analyses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "analyses_owner_delete" on public.analyses for delete using (auth.uid() = user_id);
create index if not exists analyses_user_created_idx on public.analyses (user_id, created_at desc);

-- ---------- Entretiens (audio + transcription + note, auto-suppression 24h) ----------
create table if not exists public.entretiens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  storage_path text not null,
  filename text,
  duration_ms int,
  size_bytes bigint,
  transcript text,
  note text,
  context text,
  referral_mail text,
  prescription text,
  doctor_name text,
  doctor_signature text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.entretiens add column if not exists referral_mail text;
alter table public.entretiens add column if not exists prescription text;
alter table public.entretiens add column if not exists doctor_name text;
alter table public.entretiens add column if not exists doctor_signature text;

alter table public.entretiens enable row level security;

drop policy if exists "entretiens_owner_select" on public.entretiens;
drop policy if exists "entretiens_owner_insert" on public.entretiens;
drop policy if exists "entretiens_owner_update" on public.entretiens;
drop policy if exists "entretiens_owner_delete" on public.entretiens;

create policy "entretiens_owner_select" on public.entretiens
  for select using (auth.uid() = user_id);
create policy "entretiens_owner_insert" on public.entretiens
  for insert with check (auth.uid() = user_id);
create policy "entretiens_owner_update" on public.entretiens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "entretiens_owner_delete" on public.entretiens
  for delete using (auth.uid() = user_id);

create index if not exists entretiens_user_created_idx
  on public.entretiens (user_id, created_at desc);
create index if not exists entretiens_expires_idx
  on public.entretiens (expires_at);

-- Bucket de stockage privé pour les fichiers audio
insert into storage.buckets (id, name, public)
  values ('entretiens', 'entretiens', false)
  on conflict (id) do nothing;

-- Policies sur storage.objects : chaque utilisateur ne voit/modifie que les fichiers
-- dont le chemin commence par son user_id (ex: <uid>/<uuid>.webm)
drop policy if exists "entretiens_storage_select" on storage.objects;
drop policy if exists "entretiens_storage_insert" on storage.objects;
drop policy if exists "entretiens_storage_delete" on storage.objects;

create policy "entretiens_storage_select" on storage.objects
  for select using (
    bucket_id = 'entretiens'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "entretiens_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'entretiens'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "entretiens_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'entretiens'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
