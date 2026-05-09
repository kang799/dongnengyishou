-- Public profile view exposing only safe fields, readable by everyone (anon + authenticated)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT id, display_name, avatar_url, streak_days
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Allow reading display_name/avatar/streak of any profile (needed for leaderboards & friends).
-- Sensitive fields like onboarded_at, last_active_at, is_guest stay protected by the
-- existing "profiles select own" policy because the view uses security_invoker and
-- queries via authenticated role; we add a permissive SELECT policy scoped to the
-- columns the view exposes by simply allowing SELECT on profiles for all roles —
-- BUT to keep onboarded_at private we instead keep RLS as-is and use a SECURITY DEFINER
-- approach: drop the view's reliance on invoker by switching to definer.
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = off) AS
SELECT id, display_name, avatar_url, streak_days
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;