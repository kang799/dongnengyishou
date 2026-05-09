-- 1. Drop direct INSERT policies (RPCs are SECURITY DEFINER and bypass RLS)
DROP POLICY IF EXISTS "battles insert participants" ON public.battles;
DROP POLICY IF EXISTS "logs insert own" ON public.exercise_logs;

-- 2. Restrict profiles SELECT to owner; expose public columns via a view
DROP POLICY IF EXISTS "profiles readable by all" ON public.profiles;

CREATE POLICY "profiles select own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, display_name, avatar_url, streak_days
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Allow the view to read profile rows regardless of the owner-only policy above
CREATE POLICY "profiles public columns readable"
  ON public.profiles
  FOR SELECT
  USING (true);

-- The above re-opens full-row SELECT; replace with view-only access by revoking
-- column privileges on the base table from anon/authenticated and only granting
-- the safe columns. Drop the helper policy and rely solely on column grants.
DROP POLICY IF EXISTS "profiles public columns readable" ON public.profiles;

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, avatar_url, streak_days) ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
-- The final GRANT SELECT (all cols) would defeat the purpose; instead keep
-- only column-level grants for anon/authenticated and let the owner-SELECT
-- policy gate full-row reads for the authenticated owner.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, streak_days) ON public.profiles TO authenticated;

-- 3. Lock down SECURITY DEFINER function execution
REVOKE ALL ON FUNCTION public.apply_exercise(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_exercise(text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.run_battle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_battle(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cleanup_inactive_guests() FROM PUBLIC, anon, authenticated;