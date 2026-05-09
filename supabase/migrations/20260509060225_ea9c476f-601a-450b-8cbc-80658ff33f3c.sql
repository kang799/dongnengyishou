DROP VIEW IF EXISTS public.profiles_public;

-- Allow public read of profiles so leaderboards and friends can resolve display_name.
-- profiles table only stores non-PII fields (display_name, avatar_url, streak_days,
-- onboarded_at, is_guest, last_active_at). No emails, phones, or addresses live here.
DROP POLICY IF EXISTS "profiles readable by all" ON public.profiles;
CREATE POLICY "profiles readable by all"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

-- Existing "profiles select own" becomes redundant but keep it for backwards compat;
-- remove to avoid duplicate-permissive-policy noise.
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;