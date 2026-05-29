-- ============================================
-- Class Vote — Supabase Database Schema
-- ============================================
-- Run this entire file in Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → Paste → Run)
-- ============================================

-- ----------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.profiles is 'User profiles synced from Google Auth';

-- ----------------------------------------
-- 2. VOTES TABLE
-- ----------------------------------------
create table if not exists public.votes (
  id uuid default gen_random_uuid() primary key,
  voter_id uuid references public.profiles(id) on delete cascade not null,
  nominee_id uuid references public.profiles(id) on delete cascade not null,
  category text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- One vote per person per category
  constraint unique_vote_per_category unique (voter_id, category),

  -- Cannot vote for yourself
  constraint no_self_vote check (voter_id != nominee_id)
);

comment on table public.votes is 'Votes cast by classmates for each category';

-- Index for faster vote aggregation
create index if not exists idx_votes_category on public.votes(category);
create index if not exists idx_votes_nominee on public.votes(nominee_id);
create index if not exists idx_votes_voter on public.votes(voter_id);

-- ----------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY
-- ----------------------------------------
alter table public.profiles enable row level security;
alter table public.votes enable row level security;

-- ----------------------------------------
-- 4. PROFILES — RLS POLICIES
-- ----------------------------------------

-- Anyone authenticated can see all profiles
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can only update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Allow the trigger function to insert profiles
create policy "profiles_insert_service"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- ----------------------------------------
-- 5. VOTES — RLS POLICIES
-- ----------------------------------------

-- Anyone authenticated can see all votes (for results)
create policy "votes_select_authenticated"
  on public.votes for select
  to authenticated
  using (true);

-- Users can only insert their own votes
create policy "votes_insert_own"
  on public.votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

-- Users can update their own votes
create policy "votes_update_own"
  on public.votes for update
  to authenticated
  using (auth.uid() = voter_id)
  with check (auth.uid() = voter_id);

-- Users can delete their own votes
create policy "votes_delete_own"
  on public.votes for delete
  to authenticated
  using (auth.uid() = voter_id);

-- ----------------------------------------
-- 6. AUTO-CREATE PROFILE ON SIGNUP
-- ----------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- Drop existing trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------
-- 7. UPDATED_AT AUTO-UPDATE
-- ----------------------------------------
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger votes_updated_at
  before update on public.votes
  for each row execute function public.update_updated_at();

-- ----------------------------------------
-- 8. AVATAR STORAGE BUCKET
-- ----------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can view avatars (public bucket)
create policy "avatars_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own avatar
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own avatar
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
