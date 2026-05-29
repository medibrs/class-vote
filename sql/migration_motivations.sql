-- ============================================
-- Migration: Add Motivations Feature
-- ============================================
-- Run this in Supabase SQL Editor AFTER the original schema.sql
-- ============================================

-- ----------------------------------------
-- 1. MOTIVATIONS TABLE
-- ----------------------------------------
create table if not exists public.motivations (
  id uuid default gen_random_uuid() primary key,
  category text not null,
  nominee_id uuid references public.profiles(id) on delete cascade not null,
  message text not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),

  -- Same message can't be duplicated for same person+category
  constraint unique_motivation unique (category, nominee_id, message)
);

-- Indexes
create index if not exists idx_motivations_category_nominee on public.motivations(category, nominee_id);

-- ----------------------------------------
-- 2. ADD motivation_id TO VOTES TABLE
-- ----------------------------------------
alter table public.votes
  add column if not exists motivation_id uuid references public.motivations(id) on delete set null;

-- ----------------------------------------
-- 3. RLS FOR MOTIVATIONS
-- ----------------------------------------
alter table public.motivations enable row level security;

-- Anyone authenticated can see all motivations
create policy "motivations_select_authenticated"
  on public.motivations for select
  to authenticated
  using (true);

-- Authenticated users can insert motivations
create policy "motivations_insert_authenticated"
  on public.motivations for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Users can delete their own motivations
create policy "motivations_delete_own"
  on public.motivations for delete
  to authenticated
  using (auth.uid() = created_by);
