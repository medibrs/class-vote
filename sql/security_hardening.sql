-- ============================================
-- Security Hardening — Run in Supabase SQL Editor
-- ============================================
-- Run this AFTER schema.sql and migration_motivations.sql
-- ============================================

-- ----------------------------------------
-- 1. BLOCK NON-GRITLAB.AX SIGNUPS
-- ----------------------------------------
-- This trigger runs BEFORE a new user is inserted into auth.users.
-- If the email doesn't end with @gritlab.ax, the signup is rejected
-- at the database level — no frontend bypass possible.

CREATE OR REPLACE FUNCTION public.check_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email IS NULL OR NOT NEW.email LIKE '%@gritlab.ax' THEN
    RAISE EXCEPTION 'Only @gritlab.ax emails are allowed to sign up.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_email_domain ON auth.users;
CREATE TRIGGER enforce_email_domain
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.check_email_domain();


-- ----------------------------------------
-- 2. ENFORCE VOTING TIME WINDOW IN RLS
-- ----------------------------------------
-- Votes can only be inserted/updated between:
--   May 30, 2026 10:00 EEST (UTC+3) = 07:00 UTC
--   June 2, 2026 23:59 EEST (UTC+3) = 20:59 UTC
-- This prevents DevTools API bypasses.

-- Drop old permissive policies
DROP POLICY IF EXISTS "votes_insert_own" ON public.votes;
DROP POLICY IF EXISTS "votes_update_own" ON public.votes;

-- New insert policy: own votes + within voting window
CREATE POLICY "votes_insert_own"
  ON public.votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = voter_id
    AND now() >= '2026-05-30T07:00:00Z'::timestamptz
    AND now() < '2026-06-02T20:59:00Z'::timestamptz
  );

-- New update policy: own votes + within voting window
CREATE POLICY "votes_update_own"
  ON public.votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = voter_id)
  WITH CHECK (
    auth.uid() = voter_id
    AND now() >= '2026-05-30T07:00:00Z'::timestamptz
    AND now() < '2026-06-02T20:59:00Z'::timestamptz
  );


-- ----------------------------------------
-- 3. ENFORCE MOTIVATION CONSTRAINTS
-- ----------------------------------------
-- Prevent overly long motivations via API bypass
ALTER TABLE public.motivations
  DROP CONSTRAINT IF EXISTS motivation_max_length;

ALTER TABLE public.motivations
  ADD CONSTRAINT motivation_max_length CHECK (char_length(message) <= 200);

-- Prevent empty motivations
ALTER TABLE public.motivations
  DROP CONSTRAINT IF EXISTS motivation_not_empty;

ALTER TABLE public.motivations
  ADD CONSTRAINT motivation_not_empty CHECK (char_length(trim(message)) > 0);

-- Enforce motivation insert only during voting window
DROP POLICY IF EXISTS "motivations_insert_authenticated" ON public.motivations;
CREATE POLICY "motivations_insert_authenticated"
  ON public.motivations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND now() >= '2026-05-30T07:00:00Z'::timestamptz
    AND now() < '2026-06-02T20:59:00Z'::timestamptz
  );


-- ----------------------------------------
-- 4. VALIDATE CATEGORY VALUES
-- ----------------------------------------
-- Only allow valid category strings in votes table
ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS valid_category;

ALTER TABLE public.votes
  ADD CONSTRAINT valid_category CHECK (
    category IN (
      'most_social',
      'most_helpful',
      'most_resourceful',
      'most_sporty',
      'most_collaborator',
      'most_inspiring',
      'most_entertainer',
      'most_zen',
      'most_grit',
      'most_coder'
    )
  );

-- Same for motivations table
ALTER TABLE public.motivations
  DROP CONSTRAINT IF EXISTS valid_motivation_category;

ALTER TABLE public.motivations
  ADD CONSTRAINT valid_motivation_category CHECK (
    category IN (
      'most_social',
      'most_helpful',
      'most_resourceful',
      'most_sporty',
      'most_collaborator',
      'most_inspiring',
      'most_entertainer',
      'most_zen',
      'most_grit',
      'most_coder'
    )
  );


-- ----------------------------------------
-- 5. RESTRICT DISPLAY NAME LENGTH
-- ----------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS display_name_max_length;

ALTER TABLE public.profiles
  ADD CONSTRAINT display_name_max_length CHECK (
    display_name IS NULL OR char_length(display_name) <= 50
  );


-- ----------------------------------------
-- 6. RESTRICT VOTE DELETION TO VOTING WINDOW
-- ----------------------------------------
DROP POLICY IF EXISTS "votes_delete_own" ON public.votes;
CREATE POLICY "votes_delete_own"
  ON public.votes FOR DELETE
  TO authenticated
  USING (
    auth.uid() = voter_id
    AND now() >= '2026-05-30T07:00:00Z'::timestamptz
    AND now() < '2026-06-02T20:59:00Z'::timestamptz
  );


-- ----------------------------------------
-- DONE! Security hardening applied.
-- ----------------------------------------
-- Summary of protections:
--   ✅ Non-gritlab.ax emails blocked at database level
--   ✅ Votes can only be cast during voting window (May 30 10:00 - Jun 2 23:59 EEST)
--   ✅ Motivations limited to 200 chars, non-empty
--   ✅ Only valid categories accepted
--   ✅ Display names limited to 50 chars
--   ✅ Vote deletion restricted to voting window
-- ----------------------------------------
