-- ============================================
-- SQL Script: Reset Votes and Motivations
-- ============================================
-- Run this in your Supabase SQL Editor to clear all votes
-- and motivation messages from the database.
-- ============================================

-- Clear all rows from votes and motivations tables
truncate table public.votes restart identity cascade;
truncate table public.motivations restart identity cascade;

-- (Optional) If cascade isn't fully set up or to be safe, delete all entries:
-- delete from public.votes;
-- delete from public.motivations;
